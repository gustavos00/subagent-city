// The map's model and layout, with no DOM: runs in the browser and under node --test.

/** Vertical room per row and between groups (world units). */
export const ROW_STEP = 46;
export const GROUP_GAP = 64;
export const PROJECT_GAP = 64;
/** The x of each column: sessions, subagents, projects. */
export const COLUMN_X = [0, 340, 680];

const STATE_RANK = { working: 0, recent: 1, done: 2, idle: 3 };

/**
 * A model id as people say it: "claude-opus-4-5" → "Opus 4.5", "sonnet" → "Sonnet".
 * @param model - a model id or alias
 * @returns the short name, or "" when there is none
 */
export function formatModelName(model) {
  const raw = String(model ?? "").trim().replace(/\[.*\]$/, "");
  if (!raw) return "";
  const match = raw.match(/^(?:claude-)?(opus|sonnet|haiku|fable)(?:-(\d+)(?:-(\d+))?)?/i);
  if (!match) return raw;
  const family = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  const version = match[2] ? ` ${match[2]}${match[3] && match[3].length <= 2 ? `.${match[3]}` : ""}` : "";
  return family + version;
}

/** The model family in lower case ("opus", "sonnet", ...), for colouring; "" when unknown. */
export function readModelFamily(model) {
  return /(opus|sonnet|haiku|fable)/i.exec(String(model ?? ""))?.[1].toLowerCase() ?? "";
}

/** A copy of the list with the busiest first, keeping the order within each state. */
export function sortActiveFirst(list) {
  return list.map((item, index) => ({ item, index })).sort((a, b) => (STATE_RANK[a.item.state] ?? 3) - (STATE_RANK[b.item.state] ?? 3) || a.index - b.index).map((x) => x.item);
}

/**
 * Closest positions to the wanted ones that keep the order and a minimum gap between neighbours (pool adjacent violators).
 * @param wanted - desired position per item, already in order
 * @param gap - the minimum distance between two neighbours
 * @returns the position per item
 */
export function spreadApart(wanted, gap) {
  const blocks = [];
  wanted.forEach((value, i) => {
    blocks.push({ sum: value - i * gap, count: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].count > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].count) {
      const last = blocks.pop();
      blocks[blocks.length - 1].sum += last.sum;
      blocks[blocks.length - 1].count += last.count;
    }
  });
  const result = [];
  for (const block of blocks) for (let i = 0; i < block.count; i += 1) result.push(block.sum / block.count + result.length * gap);
  return result;
}

/**
 * Turns the sessions into nodes and edges. Idle subagents fold into one "+N idle" node unless their session is in `expanded`.
 * @param sessions - from /api/sessions
 * @param expanded - ids of sessions whose idle subagents are shown one by one
 * @returns { nodes, edges }
 */
export function buildMapModel(sessions, expanded = new Set()) {
  const nodes = [];
  const edges = [];
  const projects = new Map();
  for (const session of sortActiveFirst(sessions)) {
    const node = { id: `s:${session.id}`, type: "session", col: 0, label: session.title, state: session.state, session, kids: [] };
    nodes.push(node);
    const subs = sortActiveFirst(session.subagentList ?? []);
    const open = expanded.has(session.id);
    const shown = open ? subs : subs.filter((sub) => sub.state !== "idle");
    const hidden = subs.length - shown.length + Math.max(0, (session.subagents ?? 0) - subs.length);
    for (const sub of shown) {
      const kid = { id: `a:${session.id}:${sub.id}`, type: "subagent", col: 1, label: sub.name || "Unnamed", state: sub.state, sub, parent: node.id };
      node.kids.push(kid);
      nodes.push(kid);
      edges.push({ from: node.id, to: kid.id, active: sub.state === "working" });
    }
    if (hidden > 0 || (open && subs.some((sub) => sub.state === "idle"))) {
      const count = open ? subs.filter((sub) => sub.state === "idle").length : hidden;
      const pill = { id: `idle:${session.id}`, type: "idle", col: 1, label: open ? `− hide ${count} idle` : `+${count} idle`, state: "idle", count, open, sessionId: session.id, parent: node.id };
      node.kids.push(pill);
      nodes.push(pill);
      edges.push({ from: node.id, to: pill.id, active: false });
    }
    if (session.project) {
      let project = projects.get(session.project);
      if (!project) {
        project = { id: `p:${session.project}`, type: "project", col: 2, label: session.project, state: "idle", sessions: [] };
        projects.set(session.project, project);
        nodes.push(project);
      }
      project.sessions.push(session);
      if (session.state === "working") project.state = "working";
      edges.push({ from: node.id, to: project.id, active: session.state === "working" });
    }
  }
  return { nodes, edges };
}

/**
 * Places every node: each session sits in the middle of its subagents, sessions stack top to bottom with the busiest first,
 * and each project sits at the height of the sessions working on it, pushed apart only as far as the gap needs.
 * @param model - from buildMapModel
 * @returns Map from node id to { x, y }
 */
export function layoutMap(model) {
  const pos = new Map();
  let cursor = 0;
  for (const node of model.nodes.filter((n) => n.type === "session")) {
    const rows = Math.max(1, node.kids.length);
    const top = cursor;
    node.kids.forEach((kid, i) => pos.set(kid.id, { x: COLUMN_X[1], y: top + i * ROW_STEP }));
    pos.set(node.id, { x: COLUMN_X[0], y: top + ((rows - 1) * ROW_STEP) / 2 });
    cursor = top + (rows - 1) * ROW_STEP + GROUP_GAP + (node.kids.length ? 0 : ROW_STEP / 2);
  }
  const projects = model.nodes.filter((n) => n.type === "project").map((node) => {
    const ys = model.edges.filter((e) => e.to === node.id).map((e) => pos.get(e.from).y);
    return { node, want: ys.reduce((a, b) => a + b, 0) / ys.length };
  });
  projects.sort((a, b) => a.want - b.want || a.node.id.localeCompare(b.node.id));
  spreadApart(projects.map((p) => p.want), PROJECT_GAP).forEach((y, i) => pos.set(projects[i].node.id, { x: COLUMN_X[2], y }));
  return pos;
}
