import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

export const DEFAULT_OUTBOUND_MAX_BYTES = 15 * 1024 * 1024;
export const DEFAULT_OUTBOUND_TIMEOUT_MS = 15_000;

type AddressPolicy =
  | { kind: "public" }
  | { kind: "loopback" }
  | { kind: "docker-host"; hostname: string };

type LookupRecord = { address: string; family: number };

const agents = new Map<string, Agent>();
const proxyAgents = new Map<string, ProxyAgent>();

/** A narrow seam for unit tests; production always uses Undici with our Agent. */
export const outboundTransport = { fetch: undiciFetch };

function normalizedHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
}

function ipv4Value(address: string): number | null {
  const normalized = normalizedHostname(address);
  if (isIP(normalized) !== 4) return null;
  return normalized.split(".").reduce((value, octet) => value * 256 + Number(octet), 0) >>> 0;
}

function ipv6Value(address: string): bigint | null {
  let normalized = normalizedHostname(address);
  if (isIP(normalized) !== 6) return null;
  const dotted = normalized.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const value = ipv4Value(dotted[2]);
    if (value === null) return null;
    normalized = `${dotted[1]}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (parts.length !== 8) return null;
  return parts.reduce((value, part) => (value << 16n) | BigInt(`0x${part || "0"}`), 0n);
}

function ipv4InCidr(address: number, base: number, prefix: number): boolean {
  const shift = 32 - prefix;
  return (address >>> shift) === (base >>> shift);
}

function ipv6InCidr(address: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return (address >> shift) === (base >> shift);
}

const ipv6 = (address: string) => ipv6Value(address) as bigint;

/** True only for addresses intended to be reachable on the public Internet. */
export function isPublicIpAddress(rawAddress: string): boolean {
  const address = normalizedHostname(rawAddress);
  const v4 = ipv4Value(address);
  if (v4 !== null) {
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.88.99.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return !blocked.some(([base, prefix]) => ipv4InCidr(v4, ipv4Value(base) as number, prefix));
  }

  const v6 = ipv6Value(address);
  if (v6 === null) return false;
  // IPv4-mapped IPv6 addresses inherit the IPv4 classification.
  if ((v6 >> 32n) === 0xffffn) {
    const embedded = Number(v6 & 0xffff_ffffn);
    return isPublicIpAddress(`${embedded >>> 24}.${(embedded >>> 16) & 255}.${(embedded >>> 8) & 255}.${embedded & 255}`);
  }
  const blocked: Array<[bigint, number]> = [
    [ipv6("::"), 96], // unspecified and deprecated IPv4-compatible forms
    [ipv6("64:ff9b::"), 96], // well-known NAT64 translation prefix
    [ipv6("64:ff9b:1::"), 48], // local-use NAT64 translation prefix
    [ipv6("100::"), 64], // discard-only
    [ipv6("2001::"), 32], // Teredo
    [ipv6("2001:2::"), 48], // benchmarking
    [ipv6("2001:10::"), 28], // ORCHID
    [ipv6("2001:20::"), 28], // ORCHIDv2
    [ipv6("2001:db8::"), 32], // documentation
    [ipv6("2002::"), 16], // deprecated 6to4
    [ipv6("fc00::"), 7], // unique-local
    [ipv6("fe80::"), 10], // link-local
    [ipv6("fec0::"), 10], // deprecated site-local
    [ipv6("ff00::"), 8], // multicast
  ];
  return !blocked.some(([base, prefix]) => ipv6InCidr(v6, base, prefix));
}

function isLoopbackIpAddress(rawAddress: string): boolean {
  const address = normalizedHostname(rawAddress);
  const v4 = ipv4Value(address);
  if (v4 !== null) return ipv4InCidr(v4, ipv4Value("127.0.0.0") as number, 8);
  return ipv6Value(address) === ipv6("::1");
}

function isPrivateLanIpAddress(rawAddress: string): boolean {
  const address = ipv4Value(rawAddress);
  if (address === null) return false;
  return ipv4InCidr(address, ipv4Value("10.0.0.0") as number, 8)
    || ipv4InCidr(address, ipv4Value("172.16.0.0") as number, 12)
    || ipv4InCidr(address, ipv4Value("192.168.0.0") as number, 16);
}

function isProxySyntheticIpAddress(rawAddress: string): boolean {
  const address = ipv4Value(rawAddress);
  return address !== null && ipv4InCidr(address, ipv4Value("198.18.0.0") as number, 15);
}

function allowProxySyntheticDns(): boolean {
  return process.env.ALLOW_PROXY_SYNTHETIC_DNS === "true";
}

const blockedPublicHostnames = new Set([
  "instance-data",
  "instance-data.ec2.internal",
  "metadata.google.internal",
  "metadata.goog",
]);

function isSafePublicHostname(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  if (!host || blockedPublicHostnames.has(host)) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return false;
  return isIP(host) ? isPublicIpAddress(host) : true;
}

export function isSafePublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password
      && isSafePublicHostname(url.hostname);
  } catch {
    return false;
  }
}

function validateUrl(raw: string, policy: AddressPolicy): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid outbound URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Blocked unsafe outbound URL");
  }
  const hostname = normalizedHostname(url.hostname);
  if (policy.kind === "public" && !isSafePublicHostname(hostname)) {
    throw new Error("Blocked unsafe external URL");
  }
  if (policy.kind === "loopback" && hostname !== "localhost" && !isLoopbackIpAddress(hostname)) {
    throw new Error("Blocked non-loopback local URL");
  }
  if (policy.kind === "docker-host" && hostname !== policy.hostname) {
    throw new Error("Blocked unexpected Docker host URL");
  }
  return url;
}

function addressAllowed(address: string, policy: AddressPolicy, hostname: string): boolean {
  if (policy.kind === "public") {
    // Some proxy/VPN fake-IP modes synthesize hostname answers in 198.18/15.
    // This weakens "public" semantics, so it is opt-in and never applies to literals.
    const allowSynthetic = allowProxySyntheticDns() && isIP(hostname) === 0 && isProxySyntheticIpAddress(address);
    return isPublicIpAddress(address) || allowSynthetic;
  }
  if (policy.kind === "loopback") return isLoopbackIpAddress(address);
  return normalizedHostname(hostname) === policy.hostname && isPrivateLanIpAddress(address);
}

function blockedAddressError(hostname: string): NodeJS.ErrnoException {
  const error = new Error(`Blocked hostname resolving to a non-public address: ${hostname}`) as NodeJS.ErrnoException;
  error.code = "EACCES";
  return error;
}

async function resolveAllowedAddresses(hostname: string, policy: AddressPolicy): Promise<LookupRecord[]> {
  const host = normalizedHostname(hostname);
  const records = await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !addressAllowed(record.address, policy, host))) {
    throw blockedAddressError(host);
  }
  return records;
}

function secureLookup(policy: AddressPolicy) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Node's DNS lookup callback overload is not representable by the local adapter type.
  return (hostname: string, options: any, callback: (error: NodeJS.ErrnoException | null, address?: string | LookupRecord[], family?: number) => void) => {
    resolveAllowedAddresses(hostname, policy).then((records) => {
      const requestedFamily = typeof options === "object" ? Number(options.family || 0) : Number(options || 0);
      const matching = requestedFamily ? records.filter((record) => record.family === requestedFamily) : records;
      if (!matching.length) {
        const error = new Error(`No matching address for ${hostname}`) as NodeJS.ErrnoException;
        error.code = "ENOTFOUND";
        callback(error);
      } else if (typeof options === "object" && options.all) {
        callback(null, matching);
      } else {
        callback(null, matching[0].address, matching[0].family);
      }
    }, (error) => callback(error as NodeJS.ErrnoException));
  };
}

function agentFor(policy: AddressPolicy, maxBytes: number): Agent {
  const policyKey = policy.kind === "docker-host" ? `${policy.kind}:${policy.hostname}` : policy.kind;
  const key = `${policyKey}:${maxBytes}`;
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Undici's connect option type does not expose this DNS lookup overload.
      connect: { lookup: secureLookup(policy) } as any,
      maxResponseSize: maxBytes,
    });
    agents.set(key, agent);
  }
  return agent;
}

function configuredOutboundProxy(): string | null {
  const raw = process.env.OUTBOUND_PROXY_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid OUTBOUND_PROXY_URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("OUTBOUND_PROXY_URL must be an http/https proxy origin");
  }
  return url.toString();
}

function proxyAgentFor(proxyUrl: string, maxBytes: number): ProxyAgent {
  const key = `${proxyUrl}:${maxBytes}`;
  let agent = proxyAgents.get(key);
  if (!agent) {
    agent = new ProxyAgent({ uri: proxyUrl, maxResponseSize: maxBytes });
    proxyAgents.set(key, agent);
  }
  return agent;
}

function redirectedInit(init: RequestInit, from: URL, to: URL, status: number): RequestInit {
  const headers = new Headers(init.headers);
  if (from.origin !== to.origin) {
    headers.delete("authorization");
    headers.delete("cookie");
    headers.delete("proxy-authorization");
  }
  let method = (init.method || "GET").toUpperCase();
  let body = init.body;
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
    method = "GET";
    body = undefined;
    headers.delete("content-length");
    headers.delete("content-type");
  }
  return { ...init, method, body, headers };
}

async function fetchWithPolicy(
  rawUrl: string,
  init: RequestInit,
  policy: AddressPolicy,
  redirects: number,
  maxBytes: number,
): Promise<Response> {
  const url = validateUrl(rawUrl, policy);
  const proxyUrl = policy.kind === "public" ? configuredOutboundProxy() : null;
  // A proxy resolves the destination itself, so retain the local public-address
  // preflight before handing the validated URL to the trusted configured proxy.
  if (proxyUrl) await resolveAllowedAddresses(url.hostname, policy);
  const signal = init.signal || AbortSignal.timeout(DEFAULT_OUTBOUND_TIMEOUT_MS);
  const requestInit = {
    ...init,
    signal,
    redirect: "manual" as const,
    dispatcher: (proxyUrl ? proxyAgentFor(proxyUrl, maxBytes) : agentFor(policy, maxBytes)) as Dispatcher,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Undici and DOM RequestInit types differ at this transport boundary.
  const response = await outboundTransport.fetch(url.toString(), requestInit as any) as unknown as Response;
  if (response.status >= 300 && response.status < 400) {
    if (!redirects) {
      await response.body?.cancel();
      throw new Error("Too many redirects");
    }
    const location = response.headers.get("location");
    if (!location) {
      await response.body?.cancel();
      throw new Error("Invalid redirect");
    }
    const destination = validateUrl(new URL(location, url).toString(), policy);
    await response.body?.cancel();
    return fetchWithPolicy(
      destination.toString(),
      redirectedInit(requestInit, url, destination, response.status),
      policy,
      redirects - 1,
      maxBytes,
    );
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel();
    throw new Error("External response too large");
  }
  return response;
}

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<void> {
  const url = validateUrl(rawUrl, { kind: "public" });
  if (isIP(normalizedHostname(url.hostname))) return;
  await resolveAllowedAddresses(url.hostname, { kind: "public" });
}

export function fetchPublicHttp(
  rawUrl: string,
  init: RequestInit = {},
  redirects = 3,
  maxBytes = DEFAULT_OUTBOUND_MAX_BYTES,
): Promise<Response> {
  return fetchWithPolicy(rawUrl, init, { kind: "public" }, redirects, maxBytes);
}

export function fetchLoopbackHttp(
  rawUrl: string,
  init: RequestInit = {},
  redirects = 3,
  maxBytes = DEFAULT_OUTBOUND_MAX_BYTES,
): Promise<Response> {
  return fetchWithPolicy(rawUrl, init, { kind: "loopback" }, redirects, maxBytes);
}

export function fetchDockerHostHttp(
  rawUrl: string,
  hostname: string,
  init: RequestInit = {},
  redirects = 3,
  maxBytes = DEFAULT_OUTBOUND_MAX_BYTES,
): Promise<Response> {
  return fetchWithPolicy(rawUrl, init, { kind: "docker-host", hostname: normalizedHostname(hostname) }, redirects, maxBytes);
}
