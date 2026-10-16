// The page: polls /api/sessions, draws the map on a canvas and lists the sessions in the side panel.
import { buildMapModel, formatModelName, layoutMap, readModelFamily } from "./layout.js";

const POLL_MS = 4000;
const COLORS = { working: "#ffd34d", recent: "#7c97ff", done: "#5ad0a0", idle: "#6b7388", project: "#4fb3c9", edge: "rgba(152,161,181,0.22)", edgeActive: "rgba(255,211,77,0.55)", text: "#e6e8ef", muted: "#98a1b5", bg: "#0b0f1c" };
const STATE_LABELS = { working: "Working", recent: "Paused", done: "Done", idle: "Idle" };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const tip = document.getElementById("tip");
const list = document.getElementById("sessions");

const state = {
  sessions: [],
  model: { nodes: [], edges: [] },
  pos: new Map(),
  cam: { x: 0, y: 0, k: 1 },
  width: 0,
  height: 0,
  expanded: new Set(),
  selected: null,
  hover: null,
  fitted: false,
  frame: 0,
};

// ---------- Data ----------

async function pollSessions() {
  try {
    const response = await fetch("api/sessions", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    document.getElementById("live").classList.remove("stale");
    applySessions();
  } catch {
    document.getElementById("live").classList.add("stale");
    document.getElementById("summary").textContent = "Lost contact with the local server. Is it still running?";
  } finally {
    setTimeout(pollSessions, POLL_MS);
  }
}

function applySessions() {
  if (state.selected && !state.sessions.some((s) => s.id === state.selected)) state.selected = null;
  state.model = buildMapModel(state.sessions, state.expanded);
  state.pos = layoutMap(state.model);
  for (const node of state.model.nodes) Object.assign(node, state.pos.get(node.id));
  const all = state.sessions.flatMap((s) => s.subagentList ?? []);
  const count = (st) => all.filter((a) => a.state === st).length;
  const total = state.sessions.length;
  document.getElementById("summary").textContent = total
    ? `${count("working")} ${count("working") === 1 ? "subagent" : "subagents"} working · ${count("recent")} paused · ${count("done")} done · in ${total} open ${total === 1 ? "session" : "sessions"}`
    : "No open sessions";
  document.getElementById("empty").hidden = total > 0;
  if (!state.fitted && total) {
    fitMap();
    state.fitted = true;
  }
  renderPanel();
  requestDraw();
}

// ---------- Camera ----------

function readBounds() {
  const nodes = state.model.nodes;
  if (!nodes.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return {
    minX: Math.min(...nodes.map((n) => n.x)) - 260,
    maxX: Math.max(...nodes.map((n) => n.x)) + 240,
    minY: Math.min(...nodes.map((n) => n.y)) - 50,
    maxY: Math.max(...nodes.map((n) => n.y)) + 70,
  };
}

function fitMap() {
  const b = readBounds();
  const k = Math.min(1.4, Math.max(0.2, Math.min(state.width / (b.maxX - b.minX), state.height / (b.maxY - b.minY))));
  state.cam = { k, x: state.width / 2 - ((b.minX + b.maxX) / 2) * k, y: Math.min(state.height / 2 - ((b.minY + b.maxY) / 2) * k, 30 - b.minY * k) };
  requestDraw();
}

function zoomMap(factor, cx = state.width / 2, cy = state.height / 2) {
  const k = Math.min(3, Math.max(0.15, state.cam.k * factor));
  const f = k / state.cam.k;
  state.cam = { k, x: cx - (cx - state.cam.x) * f, y: cy - (cy - state.cam.y) * f };
  requestDraw();
}

function toScreen(node) {
  return { x: node.x * state.cam.k + state.cam.x, y: node.y * state.cam.k + state.cam.y };
}

// ---------- Drawing ----------

function readRadius(node) {
  return node.type === "session" ? 11 : node.type === "project" ? 9 : 7;
}

function readColor(node) {
  return node.type === "project" ? COLORS.project : COLORS[node.state] ?? COLORS.idle;
}

function requestDraw() {
  if (!state.frame) state.frame = requestAnimationFrame(drawMap);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  state.width = rect.width;
  state.height = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestDraw();
}

function traceEdge(a, b) {
  const mid = (a.x + b.x) / 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(mid, a.y, mid, b.y, b.x, b.y);
}

function pointOnEdge(a, b, t) {
  const mid = (a.x + b.x) / 2;
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y,
  };
}

function drawColumnTitles() {
  const k = state.cam.k;
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(152,161,181,0.55)";
  const top = Math.min(...state.model.nodes.map((n) => n.y)) - 40;
  ["SESSIONS", "SUBAGENTS", "PROJECTS"].forEach((title, col) => {
    if (!state.model.nodes.some((n) => n.col === col)) return;
    ctx.fillText(title, [0, 340, 680][col] * k + state.cam.x, top * k + state.cam.y);
  });
}

function drawLabel(node, p) {
  const k = state.cam.k;
  const r = readRadius(node) * Math.max(0.6, k);
  const left = node.type === "session";
  const x = left ? p.x - r - 10 : p.x + r + 10;
  ctx.textAlign = left ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.bg;
  const main = node.type === "session" ? "600 13px system-ui, sans-serif" : "500 12px system-ui, sans-serif";
  ctx.font = main;
  const text = node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label;
  const meta = node.type === "session" ? [node.session.project, formatModelName(node.session.model)].filter(Boolean).join(" · ") : "";
  const y = meta && k >= 0.55 ? p.y - 7 : p.y;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = node.state === "idle" && node.type !== "project" ? COLORS.muted : COLORS.text;
  ctx.fillText(text, x, y);
  if (meta && k >= 0.55) {
    ctx.font = "500 11px system-ui, sans-serif";
    ctx.strokeText(meta, x, p.y + 9);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(meta, x, p.y + 9);
  }
  if (node.type === "subagent" && node.sub.model && k >= 0.45) drawModelChip(node.sub.model, x + (ctx.measureText(text).width + 8), y, main);
}

function drawModelChip(model, x, y, font) {
  const text = formatModelName(model);
  const family = readModelFamily(model);
  const tone = family === "opus" ? [200, 120, 255] : family === "haiku" ? [90, 220, 160] : [124, 151, 255];
  ctx.font = font;
  const start = x + 0;
  ctx.font = "600 10px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 12;
  const h = 15;
  ctx.beginPath();
  ctx.roundRect(start, y - h / 2, w, h, h / 2);
  ctx.fillStyle = `rgba(${tone.join(",")},0.16)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${tone.join(",")},0.55)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = family === "opus" ? "#f0c8ff" : family === "haiku" ? "#b8f0d8" : "#c4d0ff";
  ctx.fillText(text, start + w / 2, y + 0.5);
}

function drawNode(node, p) {
  const k = Math.max(0.6, state.cam.k);
  const color = readColor(node);
  const focus = state.selected && (node.id === `s:${state.selected}` || node.parent === `s:${state.selected}`);
  if (node.type === "idle") {
    ctx.font = "500 11px system-ui, sans-serif";
    const w = ctx.measureText(node.label).width + 16;
    ctx.beginPath();
    ctx.roundRect(p.x - 6, p.y - 9, w, 18, 9);
    ctx.fillStyle = "rgba(107,115,136,0.18)";
    ctx.fill();
    ctx.strokeStyle = node.id === state.hover ? COLORS.text : "rgba(152,161,181,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(node.label, p.x + 2, p.y + 0.5);
    return;
  }
  const r = readRadius(node) * k;
  if (node.state === "working" && node.type !== "project") {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,211,77,0.12)";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = node.state === "idle" && node.type === "subagent" ? "#2a3044" : color;
  ctx.fill();
  ctx.lineWidth = node.id === state.hover || focus ? 2.5 : 1.5;
  ctx.strokeStyle = node.id === state.hover || focus ? COLORS.text : color;
  ctx.stroke();
  drawLabel(node, p);
}

function drawMap(now) {
  state.frame = 0;
  ctx.clearRect(0, 0, state.width, state.height);
  const { nodes, edges } = state.model;
  if (!nodes.length) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  drawColumnTitles();
  let animating = false;
  for (const edge of edges) {
    const a = toScreen(byId.get(edge.from));
    const b = toScreen(byId.get(edge.to));
    traceEdge(a, b);
    ctx.strokeStyle = edge.active ? COLORS.edgeActive : COLORS.edge;
    ctx.lineWidth = edge.active ? 1.6 : 1;
    ctx.stroke();
    if (edge.active && !reduceMotion.matches) {
      animating = true;
      const t = ((now / 1800 + (edge.to.length % 7) / 7) % 1);
      const dot = pointOnEdge(a, b, t);
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.working;
      ctx.fill();
    }
  }
  for (const node of nodes) drawNode(node, toScreen(node));
  if (animating && !document.hidden) requestDraw();
}

// ---------- Interaction ----------

function findNodeAt(px, py) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of state.model.nodes) {
    const p = toScreen(node);
    if (node.type === "idle") {
      if (px >= p.x - 8 && px <= p.x + 110 && Math.abs(py - p.y) <= 11) return node;
      continue;
    }
    const d = Math.hypot(px - p.x, py - p.y);
    if (d <= readRadius(node) * Math.max(0.6, state.cam.k) + 8 && d < bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
}

function describeNode(node) {
  if (node.type === "session") {
    const s = node.session;
    return [STATE_LABELS[s.state], s.project, formatModelName(s.model), `${s.subagents} ${s.subagents === 1 ? "subagent" : "subagents"}`].filter(Boolean).join(" · ");
  }
  if (node.type === "subagent") return [[STATE_LABELS[node.sub.state], formatModelName(node.sub.model), formatAgo(node.sub.lastActivity)].filter(Boolean).join(" · "), node.sub.task, describeAction(node.sub)].filter(Boolean).join("\n");
  if (node.type === "project") return `${node.sessions.length} open ${node.sessions.length === 1 ? "session" : "sessions"}`;
  return node.open ? "Click to fold the idle subagents" : "Click to show the idle subagents";
}

function showTip(node, px, py) {
  if (!node) {
    tip.hidden = true;
    return;
  }
  tip.replaceChildren();
  const title = document.createElement("b");
  title.textContent = node.type === "idle" ? "Idle subagents" : node.label;
  tip.append(title, document.createTextNode(describeNode(node)));
  tip.hidden = false;
  const x = Math.min(px + 14, state.width - tip.offsetWidth - 8);
  const y = Math.min(py + 14, state.height - tip.offsetHeight - 8);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function toggleIdle(sessionId) {
  if (state.expanded.has(sessionId)) state.expanded.delete(sessionId);
  else state.expanded.add(sessionId);
  applySessions();
}

function selectSession(sessionId, scroll = true) {
  state.selected = state.selected === sessionId ? null : sessionId;
  renderPanel();
  requestDraw();
  if (scroll && state.selected) list.querySelector(`[data-session="${CSS.escape(sessionId)}"]`)?.scrollIntoView({ block: "nearest" });
}

function initInteraction() {
  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    drag = { x: event.clientX, y: event.clientY, cam: { ...state.cam }, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        canvas.classList.add("dragging");
        state.cam = { ...drag.cam, x: drag.cam.x + dx, y: drag.cam.y + dy };
        showTip(null);
        requestDraw();
        return;
      }
    }
    const node = findNodeAt(px, py);
    if ((node?.id ?? null) !== state.hover) {
      state.hover = node?.id ?? null;
      canvas.style.cursor = node ? "pointer" : "";
      requestDraw();
    }
    showTip(node, px, py);
  });
  canvas.addEventListener("pointerup", (event) => {
    canvas.classList.remove("dragging");
    const wasDrag = drag?.moved;
    drag = null;
    if (wasDrag) return;
    const rect = canvas.getBoundingClientRect();
    const node = findNodeAt(event.clientX - rect.left, event.clientY - rect.top);
    if (!node) return;
    if (node.type === "idle") toggleIdle(node.sessionId);
    else if (node.type === "session") selectSession(node.session.id);
    else if (node.type === "subagent") selectSession(node.parent.slice(2));
  });
  canvas.addEventListener("pointerleave", () => {
    state.hover = null;
    showTip(null);
    requestDraw();
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomMap(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  document.getElementById("zoom-in").addEventListener("click", () => zoomMap(1.25));
  document.getElementById("zoom-out").addEventListener("click", () => zoomMap(0.8));
  document.getElementById("fit").addEventListener("click", fitMap);
  new ResizeObserver(resizeCanvas).observe(canvas);
  document.addEventListener("visibilitychange", requestDraw);
}

// ---------- Side panel ----------

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function createModelBadge(model) {
  const name = formatModelName(model);
  if (!name) return null;
  const badge = createElement("span", `model ${readModelFamily(model)}`.trim(), name);
  badge.title = "Model";
  return badge;
}

/** "just now", "4 min ago", "2 h ago" from an ISO time. */
function formatAgo(iso) {
  const ms = Date.now() - Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "";
  if (ms < 45000) return "just now";
  if (ms < 3600000) return `${Math.round(ms / 60000)} min ago`;
  return `${Math.round(ms / 3600000)} h ago`;
}

/** The subagent's last step in one line: "Bash · npm test", its last words, or that it handed its work back. */
function describeAction(sub) {
  const action = sub.lastAction;
  if (!action) return "";
  if (sub.state === "done" || /handback/i.test(action.tool)) return "Handed its result back to the session";
  return action.kind === "tool" ? [action.tool, action.detail].filter(Boolean).join(" · ") : `“${action.detail}”`;
}

function createSubagentCard(sub) {
  const item = createElement("li", `subagent ${sub.state}`);
  const top = createElement("span", "subagent-state", [STATE_LABELS[sub.state] ?? sub.state, formatAgo(sub.lastActivity)].filter(Boolean).join(" · "));
  const head = createElement("span", "subagent-head");
  head.append(createElement("span", "subagent-name", sub.name || "Unnamed"));
  const badge = createModelBadge(sub.model);
  if (badge) head.append(badge);
  if (sub.type && sub.type !== "general-purpose") head.append(createElement("span", "subagent-type", sub.type));
  item.append(top, head);
  if (sub.task) item.append(createElement("span", "subagent-task", sub.task));
  const action = describeAction(sub);
  if (action) item.append(createElement("span", "subagent-action", action));
  return item;
}

function createSessionSection(session) {
  const item = createElement("li", "session");
  item.dataset.session = session.id;
  if (state.selected === session.id) item.setAttribute("aria-current", "true");
  const head = createElement("button", "session-head");
  head.type = "button";
  const title = createElement("span", "session-title");
  const dot = createElement("span", `dot ${session.state}`);
  dot.setAttribute("aria-hidden", "true");
  title.append(dot, createElement("span", "", session.title));
  const badge = createModelBadge(session.model);
  if (badge) title.append(badge);
  const meta = [`Session ${STATE_LABELS[session.state]?.toLowerCase() ?? ""}`.trim(), session.project, `${session.subagents} ${session.subagents === 1 ? "subagent" : "subagents"}`].filter(Boolean).join(" · ");
  head.append(title, createElement("span", "session-meta", meta));
  head.addEventListener("click", () => selectSession(session.id, false));
  item.append(head);
  const subs = session.subagentList ?? [];
  const showIdle = state.expanded.has(session.id);
  const shown = showIdle ? subs : subs.filter((s) => s.state !== "idle");
  if (shown.length) {
    const ul = createElement("ul", "subagents");
    ul.setAttribute("aria-label", `Subagents of ${session.title}`);
    for (const sub of shown) ul.append(createSubagentCard(sub));
    item.append(ul);
  } else {
    item.append(createElement("p", "none", "No subagent active in the last hour."));
  }
  const idle = subs.filter((s) => s.state === "idle").length;
  if (idle) {
    const toggle = createElement("button", "toggle-idle", showIdle ? `Hide ${idle} older` : `Show ${idle} older`);
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(showIdle));
    toggle.addEventListener("click", () => toggleIdle(session.id));
    item.append(toggle);
  }
  return item;
}

function createQuietSession(session) {
  const item = createElement("li", "quiet");
  item.dataset.session = session.id;
  if (state.selected === session.id) item.setAttribute("aria-current", "true");
  const button = createElement("button", "quiet-head");
  button.type = "button";
  const dot = createElement("span", `dot ${session.state}`);
  dot.setAttribute("aria-hidden", "true");
  button.append(dot, createElement("span", "", session.title), createElement("span", "session-meta", session.project));
  button.addEventListener("click", () => selectSession(session.id, false));
  item.append(button);
  return item;
}

function renderPanel() {
  const focused = document.activeElement?.closest?.("[data-session]")?.dataset.session;
  const busy = (s) => (s.subagentList ?? []).filter((a) => a.state === "working").length * 1000 + (s.subagentList ?? []).filter((a) => a.state !== "idle").length;
  const withSubs = state.sessions.filter((s) => s.subagents > 0).map((s, i) => ({ s, i })).sort((x, y) => busy(y.s) - busy(x.s) || x.i - y.i).map((x) => x.s);
  const quiet = state.sessions.filter((s) => !s.subagents);
  const items = [];
  if (withSubs.length) items.push(createElement("li", "group-title", "Subagents by session"));
  for (const session of withSubs) items.push(createSessionSection(session));
  if (quiet.length) {
    items.push(createElement("li", "group-title", `Sessions without subagents · ${quiet.length}`));
    for (const session of quiet) items.push(createQuietSession(session));
  }
  list.replaceChildren(...items);
  if (focused) list.querySelector(`[data-session="${CSS.escape(focused)}"] button`)?.focus();
}

resizeCanvas();
initInteraction();
pollSessions();
