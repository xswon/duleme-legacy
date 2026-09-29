import { useEffect } from "react";

const SKIP_TOOLTIP = ".wreader-nav-item, .wreader-sidebar-footer button, .wreader-story-row, .wreader-mobile-story, .playlist-open, .wreader-nav-count";

/** Page-drawn hints from the prototype; fixed positioning prevents scroller clipping. */
export function PrototypeTooltipLayer() {
  useEffect(() => {
    const tooltip = document.createElement("div");
    tooltip.className = "app-tooltip";
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);
    let anchor: HTMLElement | null = null;
    const hide = () => { anchor = null; tooltip.classList.remove("is-visible"); };
    const place = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const box = tooltip.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - margin));
      let top = rect.bottom + 8;
      if (top + box.height > window.innerHeight - margin) top = rect.top - box.height - 8;
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(Math.max(margin, top))}px`;
    };
    const skipped = (element: Element) => element.matches(SKIP_TOOLTIP) || !!element.closest(SKIP_TOOLTIP);
    const migrateTitles = (root: ParentNode = document) => {
      root.querySelectorAll("[title]").forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const text = node.getAttribute("title")?.trim();
        if (!text) return;
        node.removeAttribute("title");
        if (skipped(node)) { node.removeAttribute("data-tip"); return; }
        node.dataset.tip = text;
        if (!node.hasAttribute("aria-label") && (node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement)) node.setAttribute("aria-label", text);
      });
      const collapsed = document.querySelector(".wreader-app.is-sidebar-collapsed") !== null;
      document.querySelectorAll<HTMLElement>(".wreader-nav-item, .wreader-sidebar-footer button").forEach((node) => {
        if (!collapsed) {
          node.removeAttribute("data-tip");
          return;
        }
        const label = node.querySelector<HTMLElement>(".wreader-nav-label")?.textContent?.trim() || node.textContent?.trim();
        if (label) node.dataset.tip = label;
      });
    };
    const find = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;
    const show = (element: HTMLElement) => {
      const text = element.dataset.tip;
      if (!text) return hide();
      anchor = element;
      tooltip.textContent = text;
      tooltip.classList.add("is-visible");
      place(element);
    };
    const onMouseOver = (event: MouseEvent) => { const element = find(event.target); if (element && element !== anchor) show(element); else if (!element) hide(); };
    const onMouseOut = (event: MouseEvent) => { const element = find(event.target); if (!element || (event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) return; hide(); };
    const onFocusIn = (event: FocusEvent) => { const element = find(event.target); if (element) show(element); };
    const observer = new MutationObserver(() => migrateTitles());
    migrateTitles();
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title", "class"] });
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("click", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("click", hide);
      window.removeEventListener("scroll", hide, true);
      tooltip.remove();
    };
  }, []);
  return null;
}
