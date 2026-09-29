import "fake-indexeddb/auto";

if (typeof localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: new Map<string, string>(),
  });
}
