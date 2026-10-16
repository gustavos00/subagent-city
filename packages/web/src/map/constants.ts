/** Sizes and thresholds of the canvas map, in screen pixels unless noted. */
export const FONT_FAMILY = "system-ui, sans-serif";
export const FONTS = {
  columnTitle: `700 11px ${FONT_FAMILY}`,
  sessionLabel: `600 13px ${FONT_FAMILY}`,
  nodeLabel: `500 12px ${FONT_FAMILY}`,
  meta: `500 11px ${FONT_FAMILY}`,
  chip: `600 10px ${FONT_FAMILY}`,
  idlePill: `500 11px ${FONT_FAMILY}`,
};

export const COLUMN_TITLES = ["SESSIONS", "SUBAGENTS", "PROJECTS"];
export const COLUMN_TITLE_RISE = 40;

export const MIN_NODE_SCALE = 0.6;
export const NODE_RADIUS = { session: 11, project: 9, subagent: 7, idle: 7 } as const;
export const HIT_PADDING = 8;
export const GLOW_FACTOR = 2;

export const LABEL_GAP = 10;
export const LABEL_MAX_LENGTH = 34;
export const META_MIN_ZOOM = 0.55;
export const META_RAISE = 7;
export const META_DROP = 9;
export const CHIP_MIN_ZOOM = 0.45;
export const CHIP_GAP = 8;
export const CHIP_HEIGHT = 15;
export const CHIP_PADDING = 12;

export const IDLE_PILL = { height: 18, padding: 16, left: 6, textOffset: 2, halfHeight: 9, hitSlack: 2 } as const;

export const MAX_FIT_ZOOM = 1.4;
export const MIN_FIT_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export const MIN_ZOOM = 0.15;
export const FIT_MARGIN = { left: 260, right: 240, top: 50, bottom: 70, anchorTop: 30 } as const;
export const ZOOM_STEP = 1.25;
export const WHEEL_SENSITIVITY = 0.0015;
export const DRAG_THRESHOLD = 3;

export const PULSE_PERIOD_MS = 1800;
export const PULSE_SPREAD = 7;
export const WHEEL_LINE_PX = 16;
