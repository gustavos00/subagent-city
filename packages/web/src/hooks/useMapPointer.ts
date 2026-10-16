import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { MapNode } from "../lib/layout";
import { DRAG_THRESHOLD } from "../map/constants";
import type { Camera } from "../map/geometry";

interface PointerRenderer {
  findNodeUnder: (x: number, y: number) => MapNode | null;
  readCamera: () => Camera;
  setCamera: (cam: Camera) => void;
  setHoverId: (id: string | null) => void;
  readSize: () => { width: number; height: number };
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

type PointerMode = "idle" | "hover" | "drag";
type CanvasPointerEvent = ReactPointerEvent<HTMLCanvasElement>;

interface MapPointer {
  mode: PointerMode;
  hover: Hover | null;
  handlers: {
    onPointerDown: (event: CanvasPointerEvent) => void;
    onPointerMove: (event: CanvasPointerEvent) => void;
    onPointerUp: (event: CanvasPointerEvent) => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
}

function readPoint(event: CanvasPointerEvent): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function createHover(node: MapNode, point: { x: number; y: number }, size: { width: number; height: number }): Hover {
  return { node, ...point, boundsWidth: size.width, boundsHeight: size.height };
}

function activateNode(node: MapNode, onSelect: (id: string) => void, onToggleIdle: (id: string) => void): void {
  if (node.type === "idle") onToggleIdle(node.sessionId);
  else if (node.type === "session") onSelect(node.session.id);
  else if (node.type === "subagent") onSelect(node.sessionId);
}

interface MapPointerOptions {
  renderer: PointerRenderer;
  onSelectSession: (sessionId: string) => void;
  onToggleIdle: (sessionId: string) => void;
}

/** Drag to pan, hover for the tooltip, click to select a session or fold its idle subagents. */
export function useMapPointer({ renderer, onSelectSession, onToggleIdle }: MapPointerOptions): MapPointer {
  const dragRef = useRef<Drag | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [mode, setMode] = useState<PointerMode>("idle");

  const clearHover = () => {
    renderer.setHoverId(null);
    setHover(null);
    setMode("idle");
  };

  const handlePointerDown = (event: CanvasPointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, cam: { ...renderer.readCamera() }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (drag: Drag, event: CanvasPointerEvent): boolean => {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true;
    if (!drag.moved) return false;
    renderer.setCamera({ ...drag.cam, x: drag.cam.x + dx, y: drag.cam.y + dy });
    setMode("drag");
    setHover(null);
    return true;
  };

  const handlePointerMove = (event: CanvasPointerEvent) => {
    if (dragRef.current && moveDrag(dragRef.current, event)) return;
    const { x, y } = readPoint(event);
    const node = renderer.findNodeUnder(x, y);
    renderer.setHoverId(node?.id ?? null);
    setMode(node ? "hover" : "idle");
    setHover(node ? createHover(node, { x, y }, renderer.readSize()) : null);
  };

  const handlePointerUp = (event: CanvasPointerEvent) => {
    const wasDrag = dragRef.current?.moved ?? false;
    const wasPressed = dragRef.current !== null;
    dragRef.current = null;
    setMode("idle");
    if (wasDrag || !wasPressed) return;
    const { x, y } = readPoint(event);
    const node = renderer.findNodeUnder(x, y);
    if (!node) return;
    setMode("hover");
    activateNode(node, onSelectSession, onToggleIdle);
  };

  const handlePointerEnd = () => {
    dragRef.current = null;
    clearHover();
  };

  return {
    mode,
    hover,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    },
  };
}
