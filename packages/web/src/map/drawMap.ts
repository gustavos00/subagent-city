import { formatModelName, readModelFamily } from "../lib/format";
import type { MapModel, MapNode, Positions } from "../lib/layout";
import { readColumnX, readNodeRadius, toScreen, type Camera } from "./geometry";
import type { Palette } from "./palette";

export interface Scene {
  model: MapModel;
  pos: Positions;
  cam: Camera;
  width: number;
  height: number;
  selectedId: string | null;
  hoverId: string | null;
  palette: Palette;
  now: number;
  animate: boolean;
}

interface Point {
  x: number;
  y: number;
}

function fade(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
}

function readNodeColor(node: MapNode, palette: Palette): string {
  return node.type === "project" ? palette.project : palette[node.state];
}

function traceEdge(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
  const mid = (a.x + b.x) / 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(mid, a.y, mid, b.y, b.x, b.y);
}

function readPointOnEdge(a: Point, b: Point, t: number): Point {
  const mid = (a.x + b.x) / 2;
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y,
  };
}

function drawColumnTitles(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { model, pos, cam, palette } = scene;
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = fade(palette.muted, 0.55);
  const top = Math.min(...model.nodes.flatMap((n) => pos.get(n.id)?.y ?? [])) - 40;
  ["SESSIONS", "SUBAGENTS", "PROJECTS"].forEach((title, col) => {
    if (!model.nodes.some((n) => n.col === col)) return;
    ctx.fillText(title, readColumnX(col) * cam.k + cam.x, top * cam.k + cam.y);
  });
}

function drawModelChip(ctx: CanvasRenderingContext2D, palette: Palette, model: string, x: number, y: number): void {
  const text = formatModelName(model);
  const family = readModelFamily(model);
  const tone =
    family === "opus"
      ? { base: palette.opus, label: palette.opusText }
      : family === "haiku"
        ? { base: palette.haiku, label: palette.haikuText }
        : { base: palette.sonnet, label: palette.sonnetText };
  ctx.font = "600 10px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 12;
  const h = 15;
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, h / 2);
  ctx.fillStyle = fade(tone.base, 0.16);
  ctx.fill();
  ctx.strokeStyle = fade(tone.base, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = tone.label;
  ctx.fillText(text, x + w / 2, y + 0.5);
}

function drawLabel(ctx: CanvasRenderingContext2D, scene: Scene, node: MapNode, p: Point): void {
  const { palette } = scene;
  const k = scene.cam.k;
  const r = readNodeRadius(node) * Math.max(0.6, k);
  const isSession = node.type === "session";
  const x = isSession ? p.x - r - 10 : p.x + r + 10;
  ctx.textAlign = isSession ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.bg;
  ctx.font = isSession ? "600 13px system-ui, sans-serif" : "500 12px system-ui, sans-serif";
  const text = node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label;
  const meta =
    node.type === "session"
      ? [node.session.project, formatModelName(node.session.model)].filter(Boolean).join(" · ")
      : "";
  const y = meta && k >= 0.55 ? p.y - 7 : p.y;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = node.state === "idle" && node.type !== "project" ? palette.muted : palette.text;
  ctx.fillText(text, x, y);
  const textWidth = ctx.measureText(text).width;
  if (meta && k >= 0.55) {
    ctx.font = "500 11px system-ui, sans-serif";
    ctx.strokeText(meta, x, p.y + 9);
    ctx.fillStyle = palette.muted;
    ctx.fillText(meta, x, p.y + 9);
  }
  if (node.type === "subagent" && node.sub.model && k >= 0.45)
    drawModelChip(ctx, palette, node.sub.model, x + textWidth + 8, y);
}

function drawIdlePill(ctx: CanvasRenderingContext2D, scene: Scene, node: MapNode, p: Point): void {
  const { palette } = scene;
  ctx.font = "500 11px system-ui, sans-serif";
  const w = ctx.measureText(node.label).width + 16;
  ctx.beginPath();
  ctx.roundRect(p.x - 6, p.y - 9, w, 18, 9);
  ctx.fillStyle = fade(palette.idle, 0.18);
  ctx.fill();
  ctx.strokeStyle = node.id === scene.hoverId ? palette.text : fade(palette.muted, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.muted;
  ctx.fillText(node.label, p.x + 2, p.y + 0.5);
}

function drawNode(ctx: CanvasRenderingContext2D, scene: Scene, node: MapNode, p: Point): void {
  const { palette, selectedId } = scene;
  if (node.type === "idle") {
    drawIdlePill(ctx, scene, node, p);
    return;
  }
  const k = Math.max(0.6, scene.cam.k);
  const color = readNodeColor(node, palette);
  const focus =
    selectedId !== null &&
    (node.id === `s:${selectedId}` || (node.type === "subagent" && node.parent === `s:${selectedId}`));
  const r = readNodeRadius(node) * k;
  if (node.state === "working" && node.type !== "project") {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
    ctx.fillStyle = fade(palette.working, 0.12);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = node.state === "idle" && node.type === "subagent" ? palette.idleNode : color;
  ctx.fill();
  const emphasised = node.id === scene.hoverId || focus;
  ctx.lineWidth = emphasised ? 2.5 : 1.5;
  ctx.strokeStyle = emphasised ? palette.text : color;
  ctx.stroke();
  drawLabel(ctx, scene, node, p);
}

/** Draws the whole map. Returns true while an active edge is animating, so the caller schedules the next frame. */
export function drawMap(ctx: CanvasRenderingContext2D, scene: Scene): boolean {
  const { model, pos, cam, palette } = scene;
  ctx.clearRect(0, 0, scene.width, scene.height);
  if (!model.nodes.length) return false;
  drawColumnTitles(ctx, scene);
  const screen = (id: string): Point | null => {
    const at = pos.get(id);
    return at ? toScreen(at, cam) : null;
  };
  let animating = false;
  for (const edge of model.edges) {
    const a = screen(edge.from);
    const b = screen(edge.to);
    if (!a || !b) continue;
    traceEdge(ctx, a, b);
    ctx.strokeStyle = edge.active ? fade(palette.working, 0.55) : fade(palette.muted, 0.22);
    ctx.lineWidth = edge.active ? 1.6 : 1;
    ctx.stroke();
    if (edge.active && scene.animate) {
      animating = true;
      const t = (scene.now / 1800 + (edge.to.length % 7) / 7) % 1;
      const dot = readPointOnEdge(a, b, t);
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = palette.working;
      ctx.fill();
    }
  }
  for (const node of model.nodes) {
    const p = screen(node.id);
    if (p) drawNode(ctx, scene, node, p);
  }
  return animating;
}
