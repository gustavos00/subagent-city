import { COLUMN_X, type MapModel, type MapNode, type Positions } from "../lib/layout";

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

export function readNodeRadius(node: MapNode): number {
  return node.type === "session" ? 11 : node.type === "project" ? 9 : 7;
}

export function toScreen(point: Point, cam: Camera): Point {
  return { x: point.x * cam.k + cam.x, y: point.y * cam.k + cam.y };
}

function readBounds(model: MapModel, pos: Positions) {
  const points = model.nodes.flatMap((node) => pos.get(node.id) ?? []);
  if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - 260,
    maxX: Math.max(...xs) + 240,
    minY: Math.min(...ys) - 50,
    maxY: Math.max(...ys) + 70,
  };
}

/** The camera that shows the whole map, anchored to the top when it is taller than wide. */
export function createFitCamera(model: MapModel, pos: Positions, { width, height }: Size): Camera {
  const b = readBounds(model, pos);
  const k = Math.min(1.4, Math.max(0.2, Math.min(width / (b.maxX - b.minX), height / (b.maxY - b.minY))));
  return {
    k,
    x: width / 2 - ((b.minX + b.maxX) / 2) * k,
    y: Math.min(height / 2 - ((b.minY + b.maxY) / 2) * k, 30 - b.minY * k),
  };
}

/** Zooms by `factor` keeping the screen point (cx, cy) fixed. */
export function createZoomedCamera(cam: Camera, factor: number, cx: number, cy: number): Camera {
  const k = Math.min(3, Math.max(0.15, cam.k * factor));
  const f = k / cam.k;
  return { k, x: cx - (cx - cam.x) * f, y: cy - (cy - cam.y) * f };
}

export function readColumnX(col: number): number {
  return COLUMN_X[col] ?? 0;
}
