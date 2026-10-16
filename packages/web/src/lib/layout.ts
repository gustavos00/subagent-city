import type { Session, Subagent, SubagentState } from "@subagent-city/shared";

/** Vertical room per row and between groups (world units). */
export const ROW_STEP = 46;
export const GROUP_GAP = 64;
export const PROJECT_GAP = 64;
/** The x of each column: sessions, subagents, projects. */
export const COLUMN_X = [0, 340, 680] as const;

const STATE_RANK: Record<SubagentState, number> = { working: 0, recent: 1, done: 2, idle: 3 };

interface Point {
  x: number;
  y: number;
}

interface SessionNode {
  type: "session";
  id: string;
  col: 0;
  label: string;
  state: SubagentState;
  session: Session;
  kids: ChildNode[];
}

interface SubagentNode {
  type: "subagent";
  id: string;
  col: 1;
  label: string;
  state: SubagentState;
  sub: Subagent;
  parent: string;
}

interface IdleNode {
  type: "idle";
  id: string;
  col: 1;
  label: string;
  state: "idle";
  count: number;
  open: boolean;
  sessionId: string;
  parent: string;
}

interface ProjectNode {
  type: "project";
  id: string;
  col: 2;
  label: string;
  state: SubagentState;
  sessions: Session[];
}

type ChildNode = SubagentNode | IdleNode;

export type MapNode = SessionNode | ChildNode | ProjectNode;

interface MapEdge {
  from: string;
  to: string;
  active: boolean;
}

export interface MapModel {
  nodes: MapNode[];
  edges: MapEdge[];
}

export type Positions = Map<string, Point>;

/** A copy of the list with the busiest first, keeping the order within each state. */
export function sortActiveFirst<T extends { state: SubagentState }>(list: readonly T[]): T[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => STATE_RANK[a.item.state] - STATE_RANK[b.item.state] || a.index - b.index)
    .map((entry) => entry.item);
}

interface Block {
  sum: number;
  count: number;
}

function readMean(block: Block): number {
  return block.sum / block.count;
}

/**
 * Closest positions to the wanted ones that keep the order and a minimum gap between neighbours (pool adjacent violators).
 * @param wanted - desired position per item, already in order
 * @param gap - the minimum distance between two neighbours
 * @returns the position per item
 */
export function spreadApart(wanted: readonly number[], gap: number): number[] {
  const blocks: Block[] = [];
  wanted.forEach((value, i) => {
    blocks.push({ sum: value - i * gap, count: 1 });
    for (;;) {
      const last = blocks[blocks.length - 1];
      const before = blocks[blocks.length - 2];
      if (!last || !before || readMean(before) <= readMean(last)) break;
      blocks.pop();
      before.sum += last.sum;
      before.count += last.count;
    }
  });
  const result: number[] = [];
  for (const block of blocks) {
    for (let i = 0; i < block.count; i += 1) result.push(readMean(block) + result.length * gap);
  }
  return result;
}

/**
 * Turns the sessions into nodes and edges. Idle subagents fold into one "+N idle" node unless their session is in `expanded`.
 * @param sessions - from /api/sessions
 * @param expanded - ids of sessions whose idle subagents are shown one by one
 */
export function buildMapModel(sessions: readonly Session[], expanded: ReadonlySet<string> = new Set()): MapModel {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const projects = new Map<string, ProjectNode>();
  for (const session of sortActiveFirst(sessions)) {
    const node: SessionNode = {
      id: `s:${session.id}`,
      type: "session",
      col: 0,
      label: session.title,
      state: session.state,
      session,
      kids: [],
    };
    nodes.push(node);
    const subs = sortActiveFirst(session.subagentList);
    const open = expanded.has(session.id);
    const shown = open ? subs : subs.filter((sub) => sub.state !== "idle");
    const hidden = subs.length - shown.length + Math.max(0, session.subagents - subs.length);
    for (const sub of shown) {
      const kid: SubagentNode = {
        id: `a:${session.id}:${sub.id}`,
        type: "subagent",
        col: 1,
        label: sub.name || "Unnamed",
        state: sub.state,
        sub,
        parent: node.id,
      };
      node.kids.push(kid);
      nodes.push(kid);
      edges.push({ from: node.id, to: kid.id, active: sub.state === "working" });
    }
    if (hidden > 0 || (open && subs.some((sub) => sub.state === "idle"))) {
      const count = open ? subs.filter((sub) => sub.state === "idle").length : hidden;
      const pill: IdleNode = {
        id: `idle:${session.id}`,
        type: "idle",
        col: 1,
        label: open ? `− hide ${count} idle` : `+${count} idle`,
        state: "idle",
        count,
        open,
        sessionId: session.id,
        parent: node.id,
      };
      node.kids.push(pill);
      nodes.push(pill);
      edges.push({ from: node.id, to: pill.id, active: false });
    }
    if (session.project) {
      let project = projects.get(session.project);
      if (!project) {
        project = {
          id: `p:${session.project}`,
          type: "project",
          col: 2,
          label: session.project,
          state: "idle",
          sessions: [],
        };
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
 * @returns the position of every node by id
 */
export function layoutMap(model: MapModel): Positions {
  const pos: Positions = new Map();
  let cursor = 0;
  for (const node of model.nodes) {
    if (node.type !== "session") continue;
    const rows = Math.max(1, node.kids.length);
    const top = cursor;
    node.kids.forEach((kid, i) => pos.set(kid.id, { x: COLUMN_X[1], y: top + i * ROW_STEP }));
    pos.set(node.id, { x: COLUMN_X[0], y: top + ((rows - 1) * ROW_STEP) / 2 });
    cursor = top + (rows - 1) * ROW_STEP + GROUP_GAP + (node.kids.length ? 0 : ROW_STEP / 2);
  }
  const projects = model.nodes.flatMap((node) => {
    if (node.type !== "project") return [];
    const ys = node.sessions.flatMap((session) => pos.get(`s:${session.id}`)?.y ?? []);
    return [{ node, want: ys.reduce((a, b) => a + b, 0) / ys.length }];
  });
  projects.sort((a, b) => a.want - b.want || a.node.id.localeCompare(b.node.id));
  spreadApart(
    projects.map((project) => project.want),
    PROJECT_GAP,
  ).forEach((y, i) => {
    const project = projects[i];
    if (project) pos.set(project.node.id, { x: COLUMN_X[2], y });
  });
  return pos;
}
