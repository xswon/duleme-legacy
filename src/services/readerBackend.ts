/**
 * Environment boundary for browser-to-backend communication.
 *
 * The web build uses ordinary HTTP today. Desktop builds can install a Tauri
 * implementation before React renders, without teaching feature code whether
 * it is running in a browser or a native shell.
 */
export interface ReaderBackend {
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

const webReaderBackend: ReaderBackend = {
  request: (input, init) => globalThis.fetch(input, init),
};

let activeReaderBackend: ReaderBackend = webReaderBackend;

export function setReaderBackend(backend: ReaderBackend): void {
  activeReaderBackend = backend;
}

export function resetReaderBackend(): void {
  activeReaderBackend = webReaderBackend;
}

export function backendRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return activeReaderBackend.request(input, init);
}
