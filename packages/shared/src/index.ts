export type SessionState = "working" | "idle";

export type SubagentState = "working" | "recent" | "done" | "idle";

export type LastAction =
  | { kind: "tool"; tool: string; detail: string; at: string | null }
  | { kind: "text"; detail: string; at: string | null };

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
  state: SessionState;
  model: string;
  startedAt: string | null;
  lastActivity: string;
  subagentCount: number;
  subagents: Subagent[];
}

export interface SessionsResponse {
  sessions: Session[];
  generatedAt: string;
}
