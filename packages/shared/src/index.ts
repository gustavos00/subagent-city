export type SessionState = "working" | "idle";

export type SubagentState = "working" | "recent" | "done" | "idle";

export interface LastAction {
  kind: "tool" | "text";
  tool: string;
  detail: string;
  at: string | null;
}

export interface Subagent {
  id: string;
  name: string;
  task: string;
  model: string;
  type: string;
  state: SubagentState;
  startedAt: string | null;
  lastActivity: string;
  lastAction: LastAction | null;
}

export interface Session {
  id: string;
  title: string;
  project: string;
  cwd: string;
  state: SessionState;
  entrypoint: string;
  model: string;
  startedAt: string | null;
  lastActivity: string;
  memoryMB: number | null;
  subagents: number;
  subagentList: Subagent[];
}

export interface SessionsResponse {
  sessions: Session[];
  generatedAt: string;
}
