import { describe, expect, it, vi } from "vitest";
import { BatchMutationCoordinator } from "../src/services/batchMutation";

describe("BatchMutationCoordinator", () => {
  it("keeps the optimistic state after persistence succeeds", async () => {
    const coordinator = new BatchMutationCoordinator();
    const optimistic = vi.fn();
    const rollback = vi.fn();

    await expect(coordinator.execute({
      optimistic,
      persist: async () => undefined,
      rollback,
    })).resolves.toBe("success");

    expect(optimistic).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
    expect(coordinator.isPending).toBe(false);
  });

  it("restores the UI state and reports persistence failures", async () => {
    const coordinator = new BatchMutationCoordinator();
    const rollback = vi.fn();
    const onError = vi.fn();
    const failure = new Error("database unavailable");

    await expect(coordinator.execute({
      optimistic: vi.fn(),
      persist: async () => { throw failure; },
      rollback,
      onError,
    })).resolves.toBe("failure");

    expect(rollback).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(coordinator.isPending).toBe(false);
  });

  it("rejects a duplicate action while the first persistence is pending", async () => {
    const coordinator = new BatchMutationCoordinator();
    let finishPersistence: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { finishPersistence = resolve; });
    const firstOptimistic = vi.fn();
    const duplicateOptimistic = vi.fn();

    const first = coordinator.execute({
      optimistic: firstOptimistic,
      persist: () => pending,
      rollback: vi.fn(),
    });
    const duplicate = coordinator.execute({
      optimistic: duplicateOptimistic,
      persist: async () => undefined,
      rollback: vi.fn(),
    });

    await expect(duplicate).resolves.toBe("busy");
    expect(duplicateOptimistic).not.toHaveBeenCalled();
    finishPersistence?.();
    await expect(first).resolves.toBe("success");
    expect(firstOptimistic).toHaveBeenCalledOnce();
  });
});
