import { MODEL_TONES } from "../lib/modelTones";

interface ToneColors {
  fill: string;
  stroke: string;
  label: string;
}

type ToneKey = keyof typeof MODEL_TONES;

export interface Palette {
  working: string;
  recent: string;
  done: string;
  idle: string;
  idleNode: string;
  project: string;
  text: string;
  muted: string;
  bg: string;
  edge: string;
  edgeActive: string;
  columnTitle: string;
  workingGlow: string;
  pillFill: string;
  pillStroke: string;
  tones: Record<ToneKey, ToneColors>;
}

/** "rgba(r, g, b, a)" from a #rgb or #rrggbb colour: canvas colours are resolved here, not by the browser's colour functions. */
export function createRgba(hex: string, alpha: number): string {
  const digits = hex.trim().replace(/^#/, "");
  const full = digits.length === 3 ? digits.replace(/./g, "$&$&") : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createTones(read: (name: string) => string): Record<ToneKey, ToneColors> {
  const entries = (Object.keys(MODEL_TONES) as ToneKey[]).map((key) => {
    const tone = MODEL_TONES[key];
    const base = read(tone.base);
    return [key, { fill: createRgba(base, 0.16), stroke: createRgba(base, 0.55), label: read(tone.label) }] as const;
  });
  return Object.fromEntries(entries) as Record<ToneKey, ToneColors>;
}

/** Reads the colour tokens of the Tailwind theme, so the canvas and the DOM share one source. */
export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string): string => style.getPropertyValue(`--color-${name}`).trim();
  const muted = read("muted");
  const working = read("working");
  return {
    working,
    recent: read("recent"),
    done: read("done"),
    idle: read("idle"),
    idleNode: read("idle-node"),
    project: read("project"),
    text: read("text"),
    muted,
    bg: read("bg"),
    edge: createRgba(muted, 0.22),
    edgeActive: createRgba(working, 0.55),
    columnTitle: createRgba(muted, 0.55),
    workingGlow: createRgba(working, 0.12),
    pillFill: createRgba(read("idle"), 0.18),
    pillStroke: createRgba(muted, 0.5),
    tones: createTones(read),
  };
}
