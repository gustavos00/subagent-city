import { readPalette, type Palette } from "./palette";

interface Size {
  width: number;
  height: number;
}

interface Frame {
  size: Size;
  now: number;
  animate: boolean;
  palette: Palette;
}

interface CanvasEngine {
  requestDraw: () => void;
  readSize: () => Size;
  destroy: () => void;
}

/**
 * Owns the canvas loop: sizing for the device pixel ratio (and its changes), the resize observer, and animation frames,
 * which keep coming only while `draw` reports an animation and the tab is visible.
 */
export function createCanvasEngine(
  canvas: HTMLCanvasElement,
  draw: (ctx: CanvasRenderingContext2D, frame: Frame) => boolean,
): CanvasEngine {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let size: Size = { width: 0, height: 0 };
  let palette: Palette | null = null;
  let frame = 0;
  let ratioQuery: MediaQueryList | null = null;

  const handleFrame = (now: number): void => {
    frame = 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    palette ??= readPalette();
    const animating = draw(ctx, { size, now, animate: !reduceMotion.matches, palette });
    if (animating && !document.hidden) requestDraw();
  };

  const requestDraw = (): void => {
    if (!frame) frame = requestAnimationFrame(handleFrame);
  };

  const handleRatioChange = (): void => {
    measure();
  };

  const watchRatio = (): void => {
    ratioQuery?.removeEventListener("change", handleRatioChange);
    ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    ratioQuery.addEventListener("change", handleRatioChange, { once: true });
  };

  function measure(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    size = { width: rect.width, height: rect.height };
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    watchRatio();
    requestDraw();
  }

  const observer = new ResizeObserver(measure);
  measure();
  observer.observe(canvas);
  document.addEventListener("visibilitychange", requestDraw);
  reduceMotion.addEventListener("change", requestDraw);

  return {
    requestDraw,
    readSize: () => size,
    destroy: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      ratioQuery?.removeEventListener("change", handleRatioChange);
      document.removeEventListener("visibilitychange", requestDraw);
      reduceMotion.removeEventListener("change", requestDraw);
    },
  };
}
