import type { MapModel, MapNode, Positions } from "../lib/layout";
import { readNodeRadius, toScreen, type Camera } from "./geometry";

/** The node under the screen point (px, py), or null. The idle pill is a wide target; the others are circles. */
export function findNodeAt(model: MapModel, pos: Positions, cam: Camera, px: number, py: number): MapNode | null {
  let best: MapNode | null = null;
  let bestDistance = Infinity;
  for (const node of model.nodes) {
    const at = pos.get(node.id);
    if (!at) continue;
    const p = toScreen(at, cam);
    if (node.type === "idle") {
      if (px >= p.x - 8 && px <= p.x + 110 && Math.abs(py - p.y) <= 11) return node;
      continue;
    }
    const d = Math.hypot(px - p.x, py - p.y);
    if (d <= readNodeRadius(node) * Math.max(0.6, cam.k) + 8 && d < bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
}
