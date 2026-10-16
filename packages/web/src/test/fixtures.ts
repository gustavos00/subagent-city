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
  const subagentList = overrides.subagentList ?? [];
  return {
    id: "session",
    title: "Checkout redesign",
    project: "storefront",
    cwd: "/code/storefront",
    state: "idle",
    entrypoint: "cli",
    model: "claude-opus-4-5",
    startedAt: null,
    lastActivity: new Date().toISOString(),
    memoryMB: null,
    subagents: subagentList.length,
    subagentList,
    ...overrides,
  };
}
