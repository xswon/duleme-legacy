import React, { Suspense, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useLatestRef } from "../src/hooks/useLatestRef";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("useLatestRef", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("publishes new values only after the render commits", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const suspended = new Promise<never>(() => {});
    let currentRef: { current: string } | undefined;
    const valuesSeenDuringRender: string[] = [];

    function Harness({ value, suspend }: { value: string; suspend?: boolean }) {
      const ref = useLatestRef(value);
      currentRef = ref;
      valuesSeenDuringRender.push(ref.current);
      if (suspend) throw suspended;
      return <span>{value}</span>;
    }

    await act(async () => root.render(<Suspense fallback={<span>loading</span>}><Harness value="committed" /></Suspense>));
    expect(currentRef?.current).toBe("committed");

    await act(async () => root.render(<Suspense fallback={<span>loading</span>}><Harness value="discarded" suspend /></Suspense>));
    expect(container.textContent).toContain("loading");
    expect(currentRef?.current).toBe("committed");

    await act(async () => root.render(<Suspense fallback={<span>loading</span>}><Harness value="next-commit" /></Suspense>));
    expect(valuesSeenDuringRender.at(-1)).toBe("committed");
    expect(currentRef?.current).toBe("next-commit");
    await act(async () => root.unmount());
  });
});
