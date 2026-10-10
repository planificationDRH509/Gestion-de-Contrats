import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FloatingOverlay } from "./FloatingOverlay";

/** Recharts supplies coordinates relative to its chart, even when scrolling. */
export function ChartTooltipOverlay({ coordinate, children }: {
  coordinate?: { x: number; y: number };
  children: ReactNode;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const [chart, setChart] = useState<HTMLElement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useLayoutEffect(() => {
    setChart(marker.current?.closest<HTMLElement>(".recharts-wrapper") ?? null);
  }, []);
  useLayoutEffect(() => { setDismissed(false); }, [coordinate?.x, coordinate?.y]);
  useLayoutEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setDismissed(true); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  return <>
    <span ref={marker} hidden />
    {chart && coordinate && !dismissed && <FloatingOverlay anchor={chart} anchorPoint={coordinate} className="chart-tooltip-overlay" role="tooltip">
      {children}
    </FloatingOverlay>}
  </>;
}
