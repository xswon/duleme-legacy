export type BatchMutationResult = "success" | "failure" | "busy";

interface BatchMutation<T> {
  optimistic: () => void;
  persist: () => Promise<T>;
  rollback: () => void;
  onError?: (error: unknown) => void;
}

/** Serializes a UI mutation and guarantees rollback when persistence fails. */
export class BatchMutationCoordinator {
  private pending = false;

  get isPending() {
    return this.pending;
  }

  async execute<T>({ optimistic, persist, rollback, onError }: BatchMutation<T>): Promise<BatchMutationResult> {
    if (this.pending) return "busy";
    this.pending = true;
    optimistic();

    try {
      await persist();
      return "success";
    } catch (error) {
      rollback();
      onError?.(error);
      return "failure";
    } finally {
      this.pending = false;
    }
  }
}
