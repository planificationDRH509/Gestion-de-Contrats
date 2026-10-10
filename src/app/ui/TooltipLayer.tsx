import { useEffect, useId, useState } from "react";
import { FloatingOverlay } from "./FloatingOverlay";

/** One shared layer for the existing data-tooltip triggers throughout the app. */
export function TooltipLayer() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [, refreshContent] = useState(0);
  const id = useId();

  useEffect(() => {
    let hovered: HTMLElement | null = null;
    let focused: HTMLElement | null = null;
    const trigger = (target: EventTarget | null) => {
      const element = target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
      if (!element?.dataset.tooltip || (element.dataset.tooltipDesktop && window.innerWidth <= 960)) return null;
      return element;
    };
    const update = () => setAnchor((hovered?.isConnected ? hovered : null) ?? (focused?.isConnected ? focused : null));
    const over = (event: MouseEvent) => { hovered = trigger(event.target); update(); };
    const out = (event: MouseEvent) => { hovered = trigger(event.relatedTarget); update(); };
    const focus = (event: FocusEvent) => { focused = trigger(event.target); update(); };
    const blur = (event: FocusEvent) => { focused = trigger(event.relatedTarget); update(); };
    const close = () => { hovered = null; focused = null; setAnchor(null); };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", keydown);
    document.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, []);

  useEffect(() => {
    if (!anchor) return;
    const descriptions = (anchor.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    anchor.setAttribute("aria-describedby", [...descriptions, id].join(" "));
    const observer = new MutationObserver((records) => {
      if (!anchor.isConnected || !anchor.dataset.tooltip || anchor.closest("dialog:not([open])")) setAnchor(null);
      else if (records.some(record => record.target === anchor && record.attributeName === "data-tooltip")) refreshContent(value => value + 1);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tooltip", "open"] });
    return () => {
      observer.disconnect();
      const remaining = (anchor.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(value => value && value !== id);
      if (remaining.length) anchor.setAttribute("aria-describedby", remaining.join(" "));
      else anchor.removeAttribute("aria-describedby");
    };
  }, [anchor, id]);

  if (!anchor?.isConnected || !anchor.dataset.tooltip) return null;
  const placement = anchor.dataset.tooltipPlacement === "right" ? "right"
    : anchor.closest(".contracts-page") ? "bottom" : "top";
  return <FloatingOverlay anchor={anchor} placement={placement} id={id} role="tooltip" className="app-tooltip">
    {anchor.dataset.tooltip}
  </FloatingOverlay>;
}
