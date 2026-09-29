import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkArchitecture } from "../scripts/checkArchitecture";

const fixturesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/architecture");

describe("architecture boundary checker", () => {
  it("accepts the production module graph", () => {
    expect(checkArchitecture()).toEqual([]);
  });

  it("rejects forbidden UI imports and production cycles", () => {
    const errors = checkArchitecture({ projectRoot: path.join(fixturesRoot, "invalid"), appLineLimit: 500 });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("must not import UI module"),
      expect.stringContaining("Circular production import"),
    ]));
  });

  it("rejects services importing hooks", () => {
    const errors = checkArchitecture({ projectRoot: path.join(fixturesRoot, "service-to-hook"), appLineLimit: 500 });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("src/services/example.ts must not import hook module src/hooks/useSomething.ts"),
    ]));
  });
});
