// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: lookupMock },
  lookup: lookupMock,
}));
import { requireLocalAccess, resolveListenHost } from "../server/middleware/localAccess";
import { createChatCompletion } from "../server/services/aiService";
import { outboundTransport } from "../server/services/outboundNetwork";
import {
  assertSafeExternalUrl,
  fetchSafeExternal,
  isPublicIpAddress,
  isSafeExternalUrl,
  readResponseBodyLimited,
} from "../server/services/proxyService";

const originalSyntheticDnsSetting = process.env.ALLOW_PROXY_SYNTHETIC_DNS;
const originalOutboundProxy = process.env.OUTBOUND_PROXY_URL;

function errorCauseCodes(error: unknown): Array<string | undefined> {
  const codes: Array<string | undefined> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test walks the intentionally untyped Node error cause chain.
  for (let cause: any = error; cause; cause = cause.cause) codes.push(cause.code);
  return codes;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  lookupMock.mockReset();
  if (originalSyntheticDnsSetting === undefined) delete process.env.ALLOW_PROXY_SYNTHETIC_DNS;
  else process.env.ALLOW_PROXY_SYNTHETIC_DNS = originalSyntheticDnsSetting;
  if (originalOutboundProxy === undefined) delete process.env.OUTBOUND_PROXY_URL;
  else process.env.OUTBOUND_PROXY_URL = originalOutboundProxy;
});

describe("server local-only boundary", () => {
  it("binds native runs to loopback and Docker to its loopback-published bridge", () => {
    expect(resolveListenHost({} as NodeJS.ProcessEnv)).toBe("127.0.0.1");
    expect(resolveListenHost({ DOCKER: "true" } as NodeJS.ProcessEnv)).toBe("0.0.0.0");
  });

  it("rejects non-loopback callers and cross-site browser requests", () => {
    const next = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const request = (remoteAddress: string, headers: Record<string, string> = {}) => ({
      socket: { remoteAddress },
      get: (name: string) => headers[name.toLowerCase()],
    });

    requireLocalAccess(request("192.168.1.20") as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    requireLocalAccess(request("127.0.0.1", { "sec-fetch-site": "cross-site" }) as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(403);

    requireLocalAccess(request("::1", { origin: "http://127.0.0.1:4387" }) as never, response as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("outbound proxy safety", () => {
  it("uses an explicitly configured proxy after validating the destination address", async () => {
    process.env.OUTBOUND_PROXY_URL = "http://127.0.0.1:7897";
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.spyOn(outboundTransport, "fetch").mockResolvedValue(new Response("ok") as never);

    await fetchSafeExternal("https://example.com/feed.xml");

    expect(lookupMock).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    expect(fetchMock.mock.calls[0]![1]!.dispatcher?.constructor.name).toBe("ProxyAgent");
  });

  it("rejects an invalid explicit outbound proxy URL", async () => {
    process.env.OUTBOUND_PROXY_URL = "socks5://127.0.0.1:7897";
    await expect(fetchSafeExternal("https://example.com/feed.xml"))
      .rejects.toThrow("OUTBOUND_PROXY_URL must be an http/https proxy origin");
  });

  it("allows only public http/https URL targets", () => {
    expect(isSafeExternalUrl("https://example.com/feed.xml")).toBe(true);
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("http://user:pass@example.com/")).toBe(false);
    expect(isSafeExternalUrl("http://localhost/admin")).toBe(false);
    expect(isSafeExternalUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isSafeExternalUrl("http://2130706433/admin")).toBe(false);
    expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeExternalUrl("http://[::ffff:7f00:1]/admin")).toBe(false);
  });

  it("classifies private, link-local and documentation IP ranges as non-public", () => {
    for (const address of [
      "10.0.0.1", "100.64.0.1", "172.31.255.255", "192.168.1.1",
      "198.18.0.1", "198.19.255.255", "198.51.100.2", "203.0.113.2", "::1", "fd00::1", "fe80::1",
      "::ffff:127.0.0.1", "::ffff:7f00:1", "::7f00:1", "::c0a8:101",
    ]) expect(isPublicIpAddress(address), address).toBe(false);
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("blocks proxy synthetic DNS answers by default", async () => {
    delete process.env.ALLOW_PROXY_SYNTHETIC_DNS;
    lookupMock.mockResolvedValue([{ address: "198.18.0.116", family: 4 }]);
    await expect(assertSafeExternalUrl("https://example.com/feed.xml"))
      .rejects.toThrow("non-public address");
  });

  it("allows proxy synthetic DNS answers only with explicit opt-in", async () => {
    process.env.ALLOW_PROXY_SYNTHETIC_DNS = "true";
    lookupMock.mockResolvedValue([{ address: "198.18.0.116", family: 4 }]);
    await expect(assertSafeExternalUrl("https://example.com/feed.xml")).resolves.toBeUndefined();
  });

  it("keeps literal synthetic addresses blocked when opt-in is enabled", async () => {
    process.env.ALLOW_PROXY_SYNTHETIC_DNS = "true";
    expect(isSafeExternalUrl("http://198.18.0.116/feed.xml")).toBe(false);
    await expect(assertSafeExternalUrl("http://198.18.0.116/feed.xml"))
      .rejects.toThrow("unsafe external URL");
  });

  it("does not let synthetic DNS opt-in allow other private ranges", async () => {
    process.env.ALLOW_PROXY_SYNTHETIC_DNS = "true";
    lookupMock.mockResolvedValue([{ address: "192.168.1.10", family: 4 }]);
    await expect(assertSafeExternalUrl("https://example.com/feed.xml"))
      .rejects.toThrow("non-public address");
  });

  it("rejects a public-looking hostname when DNS includes a private address", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertSafeExternalUrl("https://example.com/feed.xml"))
      .rejects.toThrow("non-public address");
  });

  it("rejects DNS rebinding at the socket lookup after a safe preflight", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    const url = "http://rebind.example.test/resource";
    await expect(assertSafeExternalUrl(url)).resolves.toBeUndefined();

    let rejection: unknown;
    try { await fetchSafeExternal(url); } catch (error) { rejection = error; }
    expect(rejection).toBeDefined();
    expect(errorCauseCodes(rejection)).toContain("EACCES");
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it("blocks an AI hostname resolving to a private address at connection time", async () => {
    lookupMock.mockResolvedValue([{ address: "192.168.1.10", family: 4 }]);
    const realFetch = outboundTransport.fetch;
    let transportError: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test forwards the transport mock's variadic fetch arguments.
    vi.spyOn(outboundTransport, "fetch").mockImplementation(async (...args: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- The preserved fetch mock has an intentionally generic test signature.
      try { return await (realFetch as any)(...args); } catch (error) { transportError = error; throw error; }
    });

    await expect(createChatCompletion(
      { baseURL: "https://ai.example.test/v1", apiKey: "sk-secret", model: "model-1" },
      [{ role: "user", content: "hello" }],
    )).rejects.toMatchObject({ code: "upstream_error" });

    expect(errorCauseCodes(transportError)).toContain("EACCES");
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates every redirect target before following it", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    }));
    vi.spyOn(outboundTransport, "fetch").mockImplementation(fetchMock as never);

    await expect(fetchSafeExternal("https://example.com/feed.xml"))
      .rejects.toThrow("unsafe external URL");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect hostname resolving to a private address at connection time", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const realFetch = outboundTransport.fetch;
    const fetchMock = vi.spyOn(outboundTransport, "fetch")
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://redirect.example.test/resource" },
      }) as never)
      .mockImplementation(realFetch as never);

    let rejection: unknown;
    try { await fetchSafeExternal("https://public.example.test/resource"); } catch (error) { rejection = error; }

    expect(errorCauseCodes(rejection)).toContain("EACCES");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it("strips credentials but preserves ordinary headers on a cross-origin redirect", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://other.example.test/resource" },
      }))
      .mockResolvedValueOnce(new Response("ok"));
    vi.spyOn(outboundTransport, "fetch").mockImplementation(fetchMock as never);

    await fetchSafeExternal("https://api.example.test/resource", {
      headers: {
        Authorization: "Bearer secret",
        Cookie: "session=secret",
        "Proxy-Authorization": "Basic secret",
        "X-Request-ID": "request-1",
      },
    });

    const redirectedHeaders = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(redirectedHeaders.has("authorization")).toBe(false);
    expect(redirectedHeaders.has("cookie")).toBe(false);
    expect(redirectedHeaders.has("proxy-authorization")).toBe(false);
    expect(redirectedHeaders.get("x-request-id")).toBe("request-1");
  });

  it("preserves authorization on a same-origin redirect", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "/redirected" },
      }))
      .mockResolvedValueOnce(new Response("ok"));
    vi.spyOn(outboundTransport, "fetch").mockImplementation(fetchMock as never);

    await fetchSafeExternal("https://api.example.test/resource", {
      headers: { Authorization: "Bearer secret" },
    });

    const redirectedHeaders = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(redirectedHeaders.get("authorization")).toBe("Bearer secret");
  });

  it("stops chunked responses before buffering beyond the byte limit", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    }));
    await expect(readResponseBodyLimited(response, 5)).rejects.toThrow("too large");
  });
});
