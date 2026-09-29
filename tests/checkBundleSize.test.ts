import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBundleSize } from "../scripts/checkBundleSize";

const fixtureDirectories: string[] = [];

afterEach(() => {
  fixtureDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe("bundle size checker", () => {
  it("rejects a smaller raw bundle whose gzip size exceeds the budget", () => {
    const assetsDirectory = mkdtempSync(path.join(tmpdir(), "wreader-bundle-check-"));
    fixtureDirectories.push(assetsDirectory);
    writeFileSync(path.join(assetsDirectory, "largest-raw.js"), "x".repeat(2_000));
    let state = 0x12345678;
    const noisyChunk = Buffer.alloc(1_500);
    for (let index = 0; index < noisyChunk.length; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      noisyChunk[index] = state >>> 24;
    }
    writeFileSync(path.join(assetsDirectory, "largest-gzip.js"), noisyChunk);

    expect(() => checkBundleSize(assetsDirectory, 2_100, 900)).toThrow("largest-gzip.js");
  });
});
