import { useLayoutEffect, useRef } from "react";
import { describeNode, formatNodeTitle } from "../map/describeNode";
import type { MapNode } from "../lib/layout";

interface TooltipProps {
  node: MapNode;
  x: number;
  y: number;
  boundsWidth: number;
  boundsHeight: number;
}

export function Tooltip({ node, x, y, boundsWidth, boundsHeight }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const left = Math.min(x + 14, boundsWidth - tip.offsetWidth - 8);
    const top = Math.min(y + 14, boundsHeight - tip.offsetHeight - 8);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }, [node, x, y, boundsWidth, boundsHeight]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-2 max-w-80 rounded-lg border border-border bg-tip px-2.5 py-2 text-[13px] whitespace-pre-line shadow-[0_6px_24px_rgba(0,0,0,0.4)]"
    >
      <b className="mb-0.5 block">{formatNodeTitle(node)}</b>
      {describeNode(node)}
    </div>
  );
}
