import type { Session } from "@subagent-city/shared";
import { useMemo, useRef, type ReactNode } from "react";
import { MapControls } from "../components/MapControls";
import { Tooltip } from "../components/Tooltip";
import { useCanvasRenderer } from "../hooks/useCanvasRenderer";
import { useMapPointer } from "../hooks/useMapPointer";
import { buildMapModel, placeMapNodes } from "../lib/layout";

interface MapCanvasProps {
  sessions: Session[];
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onSelectSession: (sessionId: string) => void;
  onToggleIdle: (sessionId: string) => void;
  children?: ReactNode;
}

const CURSORS = { idle: "cursor-grab", hover: "cursor-pointer", drag: "cursor-grabbing" };

export function MapCanvas({ sessions, expanded, selectedId, onSelectSession, onToggleIdle, children }: MapCanvasProps) {
  const model = useMemo(() => buildMapModel(sessions, expanded), [sessions, expanded]);
  const pos = useMemo(() => placeMapNodes(model), [model]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useCanvasRenderer(canvasRef, model, pos, selectedId);
  const { mode, hover, handlers } = useMapPointer({ renderer, onSelectSession, onToggleIdle });

  return (
    <section
      aria-label="Map of sessions and their subagents"
      className="relative min-w-0 overflow-hidden bg-[radial-gradient(ellipse_at_40%_30%,var(--color-glow),var(--color-bg)_70%)]"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 size-full touch-none ${CURSORS[mode]}`}
        {...handlers}
      />
      {hover ? <Tooltip {...hover} /> : null}
      {children}
      <MapControls onZoomIn={renderer.zoomIn} onZoomOut={renderer.zoomOut} onFit={renderer.fit} />
      <p className="pointer-events-none absolute bottom-2 left-3 m-0 text-xs text-muted max-[820px]:hidden">
        Drag to pan · scroll to zoom · click a node for details
      </p>
    </section>
  );
}
