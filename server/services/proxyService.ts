import {
  assertSafePublicHttpUrl,
  DEFAULT_OUTBOUND_MAX_BYTES,
  DEFAULT_OUTBOUND_TIMEOUT_MS,
  fetchPublicHttp,
  isPublicIpAddress,
  isSafePublicHttpUrl,
} from "./outboundNetwork";

export const MAX_PROXY_BYTES = DEFAULT_OUTBOUND_MAX_BYTES;
export const MAX_AUDIO_PROXY_BYTES = 512 * 1024 * 1024;
export const EXTERNAL_FETCH_TIMEOUT_MS = DEFAULT_OUTBOUND_TIMEOUT_MS;
export { isPublicIpAddress };

export function isSafeExternalUrl(raw: string): boolean {
  return isSafePublicHttpUrl(raw);
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  await assertSafePublicHttpUrl(rawUrl);
}

export async function fetchSafeExternal(
  rawUrl: string,
  init: RequestInit = {},
  redirects = 3,
  maxBytes = MAX_PROXY_BYTES
): Promise<Response> {
  return fetchPublicHttp(rawUrl, init, redirects, maxBytes);
}

/** Read a response without ever buffering more than the configured limit. */
export async function readResponseBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("External response too large");
        throw new Error("External response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}
export function refererFor(url: string): string { if (/xyzcdn\\.net|xiaoyuzhoufm\\.com|xyzfm/.test(url)) return "https://www.xiaoyuzhoufm.com/"; if (url.includes("ximalaya.com")) return "https://www.ximalaya.com/"; if (url.includes("latepost.com")) return "https://www.latepost.com/"; if (/sspai\\.com/.test(url)) return "https://sspai.com/"; if (/36kr\\.com/.test(url)) return "https://36kr.com/"; if (/qpic\\.cn|weixin/.test(url)) return "https://mp.weixin.qq.com/"; return ""; }
