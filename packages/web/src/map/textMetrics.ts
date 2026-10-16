import { FONTS, IDLE_PILL } from "./constants";

const APPROXIMATE_CHAR_WIDTH = 6;
const widths = new Map<string, number>();
let measuringContext: CanvasRenderingContext2D | null | undefined;

function readMeasuringContext(): CanvasRenderingContext2D | null {
  measuringContext ??= document.createElement("canvas").getContext("2d");
  return measuringContext;
}

/** The drawn width of the idle pill for a label: the drawing and the hit test both use it. */
export function readIdlePillWidth(label: string): number {
  const known = widths.get(label);
  if (known !== undefined) return known;
  const ctx = readMeasuringContext();
  let text = label.length * APPROXIMATE_CHAR_WIDTH;
  if (ctx) {
    ctx.font = FONTS.idlePill;
    text = ctx.measureText(label).width;
  }
  const width = text + IDLE_PILL.padding;
  widths.set(label, width);
  return width;
}
