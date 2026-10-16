import { formatModelName } from "../lib/format";
import { readToneKey } from "../lib/modelTones";
import { type MapModel, type MapNode, type Positions } from "../lib/layout";
import {
  CHIP_GAP,
  CHIP_HEIGHT,
  CHIP_MIN_ZOOM,
  CHIP_PADDING,
  COLUMN_TITLES,
  COLUMN_TITLE_RISE,
  FONTS,
  GLOW_FACTOR,
  IDLE_PILL,
  LABEL_GAP,
  LABEL_MAX_LENGTH,
  META_DROP,
  META_MIN_ZOOM,
  META_RAISE,
  PULSE_PERIOD_MS,
  PULSE_SPREAD,
} from "./constants";
import { convertToScreen, readColumnX, readScaledRadius, type Camera } from "./geometry";
import type { Palette } from "./palette";
import { readIdlePillWidth } from "./textMetrics";

interface DrawScene {
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

type Context = CanvasRenderingContext2D;

function readNodeColor(node: MapNode, palette: Palette): string {
  return node.type === "project" ? palette.project : palette[node.state];
}

function traceEdge(ctx: Context, a: Point, b: Point): void {
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

function drawColumnTitles(ctx: Context, scene: DrawScene): void {
  const { model, pos, cam, palette } = scene;
  ctx.font = FONTS.columnTitle;
  ctx.textAlign = "center";
  ctx.fillStyle = palette.columnTitle;
  const top = Math.min(...model.nodes.flatMap((n) => pos.get(n.id)?.y ?? [])) - COLUMN_TITLE_RISE;
  COLUMN_TITLES.forEach((title, col) => {
    if (model.nodes.some((n) => n.col === col))
      ctx.fillText(title, readColumnX(col) * cam.k + cam.x, top * cam.k + cam.y);
  });
}

function drawModelChip(ctx: Context, palette: Palette, model: string, x: number, y: number): void {
  const text = formatModelName(model);
  const tone = palette.tones[readToneKey(model)];
  ctx.font = FONTS.chip;
  const w = ctx.measureText(text).width + CHIP_PADDING;
  ctx.beginPath();
  ctx.roundRect(x, y - CHIP_HEIGHT / 2, w, CHIP_HEIGHT, CHIP_HEIGHT / 2);
  ctx.fillStyle = tone.fill;
  ctx.fill();
  ctx.strokeStyle = tone.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = tone.label;
  ctx.fillText(text, x + w / 2, y + 0.5);
}

/** Draws text with a halo in the background colour; returns its width. */
function drawHaloText(ctx: Context, scene: DrawScene, text: string, font: string, fill: string, at: Point): number {
  ctx.font = font;
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = scene.palette.bg;
  ctx.strokeText(text, at.x, at.y);
  ctx.fillStyle = fill;
  ctx.fillText(text, at.x, at.y);
  return ctx.measureText(text).width;
}

function readLabelText(node: MapNode): string {
  return node.label.length > LABEL_MAX_LENGTH ? `${node.label.slice(0, LABEL_MAX_LENGTH - 1)}…` : node.label;
}

function readMetaText(node: MapNode): string {
  if (node.type !== "session") return "";
  return [node.session.project, formatModelName(node.session.model)].filter(Boolean).join(" · ");
}

function readLabelColor(node: MapNode, palette: Palette): string {
  return node.state === "idle" && node.type !== "project" ? palette.muted : palette.text;
}

function isChipShown(node: MapNode, zoom: number): boolean {
  return node.type === "subagent" && node.sub.model !== "" && zoom >= CHIP_MIN_ZOOM;
}

function drawLabel(ctx: Context, scene: DrawScene, node: MapNode, p: Point): void {
  const { palette, cam } = scene;
  const isSession = node.type === "session";
  const reach = readScaledRadius(node, cam) + LABEL_GAP;
  const x = isSession ? p.x - reach : p.x + reach;
  ctx.textAlign = isSession ? "right" : "left";
  ctx.textBaseline = "middle";
  const meta = cam.k >= META_MIN_ZOOM ? readMetaText(node) : "";
  const at = { x, y: meta ? p.y - META_RAISE : p.y };
  const font = isSession ? FONTS.sessionLabel : FONTS.nodeLabel;
  const width = drawHaloText(ctx, scene, readLabelText(node), font, readLabelColor(node, palette), at);
  if (meta) drawHaloText(ctx, scene, meta, FONTS.meta, palette.muted, { x, y: p.y + META_DROP });
  if (node.type === "subagent" && isChipShown(node, cam.k)) {
    drawModelChip(ctx, palette, node.sub.model, x + width + CHIP_GAP, at.y);
  }
}

function drawIdlePill(ctx: Context, scene: DrawScene, node: MapNode, p: Point): void {
  const { palette } = scene;
  const { height, left, halfHeight, textOffset } = IDLE_PILL;
  ctx.font = FONTS.idlePill;
  ctx.beginPath();
  ctx.roundRect(p.x - left, p.y - halfHeight, readIdlePillWidth(node.label), height, halfHeight);
  ctx.fillStyle = palette.pillFill;
  ctx.fill();
  ctx.strokeStyle = node.id === scene.hoverId ? palette.text : palette.pillStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.muted;
  ctx.fillText(node.label, p.x + textOffset, p.y + 0.5);
}

function isFocused(node: MapNode, selectedId: string | null): boolean {
  if (selectedId === null) return false;
  return node.id === `s:${selectedId}` || (node.type === "subagent" && node.sessionId === selectedId);
}

function drawGlow(ctx: Context, palette: Palette, p: Point, radius: number): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius * GLOW_FACTOR, 0, Math.PI * 2);
  ctx.fillStyle = palette.workingGlow;
  ctx.fill();
}

function drawNode(ctx: Context, scene: DrawScene, node: MapNode, p: Point): void {
  const { palette } = scene;
  if (node.type === "idle") {
    drawIdlePill(ctx, scene, node, p);
    return;
  }
  const color = readNodeColor(node, palette);
  const r = readScaledRadius(node, scene.cam);
  if (node.state === "working" && node.type !== "project") drawGlow(ctx, palette, p, r);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = node.state === "idle" && node.type === "subagent" ? palette.idleNode : color;
  ctx.fill();
  const emphasised = node.id === scene.hoverId || isFocused(node, scene.selectedId);
  ctx.lineWidth = emphasised ? 2.5 : 1.5;
  ctx.strokeStyle = emphasised ? palette.text : color;
  ctx.stroke();
  drawLabel(ctx, scene, node, p);
}

function drawPulse(ctx: Context, scene: DrawScene, to: string, a: Point, b: Point): void {
  const t = (scene.now / PULSE_PERIOD_MS + (to.length % PULSE_SPREAD) / PULSE_SPREAD) % 1;
  const dot = readPointOnEdge(a, b, t);
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = scene.palette.working;
  ctx.fill();
}

function drawEdges(ctx: Context, scene: DrawScene, findScreenPoint: (id: string) => Point | null): boolean {
  let animating = false;
  for (const edge of scene.model.edges) {
    const a = findScreenPoint(edge.from);
    const b = findScreenPoint(edge.to);
    if (!a || !b) continue;
    traceEdge(ctx, a, b);
    ctx.strokeStyle = edge.active ? scene.palette.edgeActive : scene.palette.edge;
    ctx.lineWidth = edge.active ? 1.6 : 1;
    ctx.stroke();
    if (edge.active && scene.animate) {
      animating = true;
      drawPulse(ctx, scene, edge.to, a, b);
    }
  }
  return animating;
}

/** Draws the whole map. Returns true while an active edge is animating, so the caller schedules the next frame. */
export function drawMap(ctx: Context, scene: DrawScene): boolean {
  ctx.clearRect(0, 0, scene.width, scene.height);
  if (!scene.model.nodes.length) return false;
  drawColumnTitles(ctx, scene);
  const findScreenPoint = (id: string): Point | null => {
    const at = scene.pos.get(id);
    return at ? convertToScreen(at, scene.cam) : null;
  };
  const animating = drawEdges(ctx, scene, findScreenPoint);
  for (const node of scene.model.nodes) {
    const p = findScreenPoint(node.id);
    if (p) drawNode(ctx, scene, node, p);
  }
  return animating;
}
