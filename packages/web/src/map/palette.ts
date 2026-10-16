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
  opus: string;
  opusText: string;
  sonnet: string;
  sonnetText: string;
  haiku: string;
  haikuText: string;
}

/** Reads the colour tokens of the Tailwind theme, so the canvas and the DOM share one source. */
export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string): string => style.getPropertyValue(`--color-${name}`).trim();
  return {
    working: read("working"),
    recent: read("recent"),
    done: read("done"),
    idle: read("idle"),
    idleNode: read("idle-node"),
    project: read("project"),
    text: read("text"),
    muted: read("muted"),
    bg: read("bg"),
    opus: read("opus"),
    opusText: read("opus-text"),
    sonnet: read("sonnet"),
    sonnetText: read("sonnet-text"),
    haiku: read("haiku"),
    haikuText: read("haiku-text"),
  };
}
