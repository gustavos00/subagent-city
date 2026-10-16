import type { Session, Subagent } from "@subagent-city/shared";

export function createSubagent(overrides: Partial<Subagent> = {}): Subagent {
  return {
    id: "sub",
    name: "Maya",
    task: "build the drawer",
    model: "claude-sonnet-4-5",
    type: "general-purpose",
    state: "working",
    startedAt: null,
    lastActivity: new Date().toISOString(),
    lastAction: null,
    ...overrides,
  };
}

export function createSession(overrides: Partial<Session> = {}): Session {
  const subagents = overrides.subagents ?? [];
  return {
    id: "session",
    title: "Checkout redesign",
    project: "storefront",
    state: "idle",
    model: "claude-opus-4-5",
    startedAt: null,
    lastActivity: new Date().toISOString(),
    subagentCount: subagents.length,
    subagents: subagents,
    ...overrides,
  };
}
