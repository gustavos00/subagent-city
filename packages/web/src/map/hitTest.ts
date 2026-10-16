import type { MapModel, MapNode, Positions } from "../lib/layout";
import { HIT_PADDING, IDLE_PILL } from "./constants";
import { convertToScreen, readScaledRadius, type Camera } from "./geometry";
import { readIdlePillWidth } from "./textMetrics";

interface Point {
  x: number;
  y: number;
}

function isOnIdlePill(label: string, p: Point, px: number, py: number): boolean {
  const left = p.x - IDLE_PILL.left;
  return (
    px >= left &&
    px <= left + readIdlePillWidth(label) &&
    Math.abs(py - p.y) <= IDLE_PILL.halfHeight + IDLE_PILL.hitSlack
  );
}

/** The node under the screen point (px, py), or null. The idle pill is a rectangle; the others are circles. */
export function findNodeAt(model: MapModel, pos: Positions, cam: Camera, px: number, py: number): MapNode | null {
  let best: MapNode | null = null;
  let bestDistance = Infinity;
  for (const node of model.nodes) {
    const at = pos.get(node.id);
    if (!at) continue;
    const p = convertToScreen(at, cam);
    if (node.type === "idle") {
      if (isOnIdlePill(node.label, p, px, py)) return node;
      continue;
    }
    const d = Math.hypot(px - p.x, py - p.y);
    if (d <= readScaledRadius(node, cam) + HIT_PADDING && d < bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
}
