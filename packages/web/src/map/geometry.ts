import { COLUMN_X, type MapModel, type MapNode, type Positions } from "../lib/layout";
import {
  FIT_MARGIN,
  MAX_FIT_ZOOM,
  MAX_ZOOM,
  MIN_FIT_ZOOM,
  MIN_NODE_SCALE,
  MIN_ZOOM,
  NODE_RADIUS,
  WHEEL_LINE_PX,
} from "./constants";

export interface Camera {
  x: number;
  y: number;
  k: number;
}

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

/** Nodes keep a readable size when zoomed far out. */
export function readNodeScale(cam: Camera): number {
  return Math.max(MIN_NODE_SCALE, cam.k);
}

/** The node's radius on screen. */
export function readScaledRadius(node: MapNode, cam: Camera): number {
  return NODE_RADIUS[node.type] * readNodeScale(cam);
}

export function convertToScreen(point: Point, cam: Camera): Point {
  return { x: point.x * cam.k + cam.x, y: point.y * cam.k + cam.y };
}

function readBounds(model: MapModel, pos: Positions) {
  const points = model.nodes.flatMap((node) => pos.get(node.id) ?? []);
  if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - FIT_MARGIN.left,
    maxX: Math.max(...xs) + FIT_MARGIN.right,
    minY: Math.min(...ys) - FIT_MARGIN.top,
    maxY: Math.max(...ys) + FIT_MARGIN.bottom,
  };
}

/** The camera that shows the whole map, anchored to the top when it is taller than wide. */
export function createFitCamera(model: MapModel, pos: Positions, { width, height }: Size): Camera {
  const b = readBounds(model, pos);
  const fit = Math.min(width / (b.maxX - b.minX), height / (b.maxY - b.minY));
  const k = Math.min(MAX_FIT_ZOOM, Math.max(MIN_FIT_ZOOM, fit));
  return {
    k,
    x: width / 2 - ((b.minX + b.maxX) / 2) * k,
    y: Math.min(height / 2 - ((b.minY + b.maxY) / 2) * k, FIT_MARGIN.anchorTop - b.minY * k),
  };
}

/** Zooms by `factor` keeping the screen point (cx, cy) fixed. */
export function createZoomedCamera(cam: Camera, factor: number, cx: number, cy: number): Camera {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.k * factor));
  const f = k / cam.k;
  return { k, x: cx - (cx - cam.x) * f, y: cy - (cy - cam.y) * f };
}

export function readColumnX(col: number): number {
  return COLUMN_X[col] ?? 0;
}

/** The wheel movement in pixels, whether the device reports pixels, lines or pages. */
export function readWheelPixels(event: Pick<WheelEvent, "deltaY" | "deltaMode">, pageHeight: number): number {
  const unit = [1, WHEEL_LINE_PX, pageHeight][event.deltaMode] ?? 1;
  return event.deltaY * unit;
}
