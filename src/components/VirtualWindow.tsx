import React, { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualWindowProps {
  count: number;
  estimateSize: number;
  gap?: number;
  overscan?: number;
  className?: string;
  getItemKey?: (index: number) => React.Key;
  renderItem: (index: number) => React.ReactNode;
}

export function measureScrollMargin(root: HTMLElement, scrollElement: HTMLElement): number {
  const rootRect = root.getBoundingClientRect();
  const scrollRect = scrollElement.getBoundingClientRect();
  return rootRect.top - scrollRect.top - scrollElement.clientTop + scrollElement.scrollTop;
}

/** Virtualize rows against the existing reader master scroller. */
export function VirtualWindow({
  count,
  estimateSize,
  gap = 0,
  overscan = 8,
  className,
  getItemKey,
  renderItem,
}: VirtualWindowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    gap,
    overscan,
    getItemKey,
    scrollMargin,
    initialRect: { width: 600, height: 800 },
    measureElement: (element, entry) => {
      const borderBoxSize = entry?.borderBoxSize?.[0];
      return borderBoxSize?.blockSize || element.getBoundingClientRect().height || estimateSize;
    },
  });

  // The callback measures the current DOM ref after each layout; adding state dependencies changes its offset timing.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The no-dependency lifecycle is required for dynamic content above the virtual window.
  useLayoutEffect(() => {
    const nextScrollElement = rootRef.current?.closest<HTMLElement>(".wreader-master-scroll") ?? null;
    if (nextScrollElement !== scrollElement) setScrollElement(nextScrollElement);
    if (rootRef.current && nextScrollElement) {
      const nextMargin = measureScrollMargin(rootRef.current, nextScrollElement);
      if (nextMargin !== scrollMargin) setScrollMargin(nextMargin);
    }
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [scrollElement, scrollMargin, virtualizer]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !scrollElement) return;
    const updateMargin = () => {
      const nextMargin = measureScrollMargin(root, scrollElement);
      setScrollMargin((current) => current === nextMargin ? current : nextMargin);
    };
    updateMargin();

    const ResizeObserverConstructor = scrollElement.ownerDocument.defaultView?.ResizeObserver;
    const observer = ResizeObserverConstructor ? new ResizeObserverConstructor(updateMargin) : null;
    let ancestor: HTMLElement | null = root;
    while (observer && ancestor) {
      observer.observe(ancestor);
      if (ancestor === scrollElement) break;
      ancestor = ancestor.parentElement;
    }
    const targetWindow = scrollElement.ownerDocument.defaultView;
    targetWindow?.addEventListener("resize", updateMargin);
    return () => {
      observer?.disconnect();
      targetWindow?.removeEventListener("resize", updateMargin);
    };
  }, [scrollElement]);

  return (
    <div
      ref={rootRef}
      className={className}
      data-virtual-count={count}
      data-virtual-scroll-margin={scrollMargin}
      style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={virtualizer.measureElement}
          style={{
            left: 0,
            position: "absolute",
            top: 0,
            transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            width: "100%",
          }}
        >
          {renderItem(virtualRow.index)}
        </div>
      ))}
    </div>
  );
}
