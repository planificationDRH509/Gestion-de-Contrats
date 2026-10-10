import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom" | "right";

/** Escape clipping/stacking ancestors, including native modal dialogs. */
export function FloatingOverlay({ anchor, anchorPoint, placement = "bottom", className = "", children, ...props }: {
  anchor: HTMLElement;
  anchorPoint?: { x: number; y: number };
  placement?: Placement;
} & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = ref.current!;
    // Popovers enter the browser's top layer; fixed positioning is the fallback.
    if (panel.showPopover) {
      panel.setAttribute("popover", "manual");
      panel.showPopover();
    }
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const rect = anchorPoint ? {
        left: bounds.left + anchorPoint.x * bounds.width / (anchor.offsetWidth || bounds.width),
        right: bounds.left + anchorPoint.x * bounds.width / (anchor.offsetWidth || bounds.width),
        top: bounds.top + anchorPoint.y * bounds.height / (anchor.offsetHeight || bounds.height),
        bottom: bounds.top + anchorPoint.y * bounds.height / (anchor.offsetHeight || bounds.height),
        width: 0,
        height: 0
      } : bounds;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const margin = 8;
      const gap = 8;
      let left = rect.left + (rect.width - width) / 2;
      let top = rect.bottom + gap;
      if (placement === "right") {
        left = rect.right + gap;
        if (left + width > window.innerWidth - margin) left = rect.left - width - gap;
        top = rect.top + (rect.height - height) / 2;
      } else {
        const above = rect.top - gap - height;
        const belowFits = top + height <= window.innerHeight - margin;
        if (placement === "top" ? above >= margin || !belowFits : !belowFits && above >= margin) top = above;
      }
      panel.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`;
      panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(panel);
    observer?.observe(anchor);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
      if (panel.hidePopover && panel.matches(":popover-open")) panel.hidePopover();
    };
  }, [anchor, anchorPoint?.x, anchorPoint?.y, placement]);

  return createPortal(
    <div {...props} ref={ref} className={`floating-overlay ${className}`}>
      {children}
    </div>, anchor.closest("dialog[open]") ?? document.body
  );
}
