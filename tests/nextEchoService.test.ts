import { afterEach, describe, expect, it } from "vitest";
import { isAllowedNextEchoUrl } from "../server/services/nextEchoService";

describe("NextEcho URL boundary", () => {
  const originalDocker = process.env.DOCKER;

  afterEach(() => {
    if (originalDocker === undefined) delete process.env.DOCKER;
    else process.env.DOCKER = originalDocker;
  });

  it("allows loopback HTTP URLs", () => {
    expect(isAllowedNextEchoUrl("http://127.0.0.1:8765")).toBe(true);
    expect(isAllowedNextEchoUrl("http://localhost:8765")).toBe(true);
  });

  it("allows Docker host gateway only inside Docker", () => {
    delete process.env.DOCKER;
    expect(isAllowedNextEchoUrl("http://host.docker.internal:8765")).toBe(false);

    process.env.DOCKER = "true";
    expect(isAllowedNextEchoUrl("http://host.docker.internal:8765")).toBe(true);
  });

  it("rejects non-local or non-HTTP URLs", () => {
    process.env.DOCKER = "true";
    expect(isAllowedNextEchoUrl("https://127.0.0.1:8765")).toBe(false);
    expect(isAllowedNextEchoUrl("http://192.168.1.8:8765")).toBe(false);
    expect(isAllowedNextEchoUrl("not-a-url")).toBe(false);
  });
});
