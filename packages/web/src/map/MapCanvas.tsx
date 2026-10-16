import type { Session } from "@subagent-city/shared";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { MapControls } from "../components/MapControls";
import { Tooltip } from "../components/Tooltip";
import { buildMapModel, layoutMap, type MapModel, type MapNode, type Positions } from "../lib/layout";
import { drawMap } from "./drawMap";
import { createFitCamera, createZoomedCamera, type Camera } from "./geometry";
import { findNodeAt } from "./hitTest";
import { readPalette, type Palette } from "./palette";

interface MapCanvasProps {
  sessions: Session[];
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onSelectSession: (sessionId: string) => void;
  onToggleIdle: (sessionId: string) => void;
  children?: ReactNode;
}

interface Hover {
  node: MapNode;
  x: number;
  y: number;
  boundsWidth: number;
  boundsHeight: number;
}

interface Drag {
  x: number;
  y: number;
  cam: Camera;
  moved: boolean;
}

interface Scene {
  model: MapModel;
  pos: Positions;
  selectedId: string | null;
  hoverId: string | null;
}

type Mode = "idle" | "hover" | "drag";

const CURSORS: Record<Mode, string> = { idle: "cursor-grab", hover: "cursor-pointer", drag: "cursor-grabbing" };

export function MapCanvas({ sessions, expanded, selectedId, onSelectSession, onToggleIdle, children }: MapCanvasProps) {
  const model = useMemo(() => buildMapModel(sessions, expanded), [sessions, expanded]);
  const pos = useMemo(() => layoutMap(model), [model]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene>({ model, pos, selectedId, hoverId: null });
  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ width: 0, height: 0 });
  const dragRef = useRef<Drag | null>(null);
  const requestDrawRef = useRef<() => void>(() => undefined);
  const hasFittedRef = useRef(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [mode, setMode] = useState<Mode>("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let palette: Palette | null = null;
    let frame = 0;

    const drawFrame = (now: number): void => {
      frame = 0;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      palette ??= readPalette();
      const { width, height } = sizeRef.current;
      const animating = drawMap(ctx, {
        ...sceneRef.current,
        cam: camRef.current,
        width,
        height,
        palette,
        now,
        animate: !reduceMotion.matches,
      });
      if (animating && !document.hidden) requestDraw();
    };
    const requestDraw = (): void => {
      if (!frame) frame = requestAnimationFrame(drawFrame);
    };
    const measure = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      requestDraw();
    };
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      camRef.current = createZoomedCamera(
        camRef.current,
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      requestDraw();
    };

    requestDrawRef.current = requestDraw;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("visibilitychange", requestDraw);
    reduceMotion.addEventListener("change", requestDraw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("wheel", handleWheel);
      document.removeEventListener("visibilitychange", requestDraw);
      reduceMotion.removeEventListener("change", requestDraw);
    };
  }, []);

  useEffect(() => {
    sceneRef.current = { model, pos, selectedId, hoverId: sceneRef.current.hoverId };
    if (!hasFittedRef.current && model.nodes.length) {
      camRef.current = createFitCamera(model, pos, sizeRef.current);
      hasFittedRef.current = true;
    }
    requestDrawRef.current();
  }, [model, pos, selectedId]);

  const readPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const readBounds = () => ({ boundsWidth: sizeRef.current.width, boundsHeight: sizeRef.current.height });

  const findNodeUnder = (x: number, y: number): MapNode | null =>
    findNodeAt(sceneRef.current.model, sceneRef.current.pos, camRef.current, x, y);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, cam: { ...camRef.current }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = readPointer(event);
    const drag = dragRef.current;
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        camRef.current = { ...drag.cam, x: drag.cam.x + dx, y: drag.cam.y + dy };
        setMode("drag");
        setHover(null);
        requestDrawRef.current();
        return;
      }
    }
    const node = findNodeUnder(x, y);
    if ((node?.id ?? null) !== sceneRef.current.hoverId) {
      sceneRef.current.hoverId = node?.id ?? null;
      requestDrawRef.current();
    }
    setMode(node ? "hover" : "idle");
    setHover(node ? { node, x, y, ...readBounds() } : null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const wasDrag = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setMode("idle");
    if (wasDrag) return;
    const { x, y } = readPointer(event);
    const node = findNodeUnder(x, y);
    if (!node) return;
    setMode("hover");
    if (node.type === "idle") onToggleIdle(node.sessionId);
    else if (node.type === "session") onSelectSession(node.session.id);
    else if (node.type === "subagent") onSelectSession(node.parent.slice(2));
  };

  const handlePointerLeave = () => {
    sceneRef.current.hoverId = null;
    setHover(null);
    setMode("idle");
    requestDrawRef.current();
  };

  const zoomBy = (factor: number) => {
    const { width, height } = sizeRef.current;
    camRef.current = createZoomedCamera(camRef.current, factor, width / 2, height / 2);
    requestDrawRef.current();
  };

  const fit = () => {
    camRef.current = createFitCamera(model, pos, sizeRef.current);
    requestDrawRef.current();
  };

  return (
    <section
      aria-label="Map of sessions and their subagents"
      className="relative min-w-0 overflow-hidden bg-[radial-gradient(ellipse_at_40%_30%,var(--color-glow),var(--color-bg)_70%)]"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 size-full touch-none ${CURSORS[mode]}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />
      {hover ? (
        <Tooltip
          node={hover.node}
          x={hover.x}
          y={hover.y}
          boundsWidth={hover.boundsWidth}
          boundsHeight={hover.boundsHeight}
        />
      ) : null}
      {children}
      <MapControls
        onZoomIn={() => {
          zoomBy(1.25);
        }}
        onZoomOut={() => {
          zoomBy(0.8);
        }}
        onFit={fit}
      />
      <p className="pointer-events-none absolute bottom-2 left-3 m-0 text-xs text-muted max-[820px]:hidden">
        Drag to pan · scroll to zoom · click a node for details
      </p>
    </section>
  );
}
