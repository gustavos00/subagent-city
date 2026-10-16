import type { LastAction, Session, Subagent, SubagentState } from "@subagent-city/shared";

const SUBAGENT_STATES: readonly unknown[] = ["working", "recent", "done", "idle"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSubagentState(value: unknown): value is SubagentState {
  return SUBAGENT_STATES.includes(value);
}

function isLastAction(value: unknown): value is LastAction {
  if (!isRecord(value) || typeof value["detail"] !== "string" || !isNullableString(value["at"])) return false;
  return value["kind"] === "text" || (value["kind"] === "tool" && typeof value["tool"] === "string");
}

function isSubagent(value: unknown): value is Subagent {
  if (!isRecord(value) || !isSubagentState(value["state"])) return false;
  const texts = [value["id"], value["name"], value["task"], value["model"], value["type"], value["lastActivity"]];
  return (
    texts.every((text) => typeof text === "string") &&
    isNullableString(value["startedAt"]) &&
    (value["lastAction"] === null || isLastAction(value["lastAction"]))
  );
}

function isSessionShape(value: unknown): value is Omit<Session, "subagents"> & { subagents: unknown } {
  if (!isRecord(value) || (value["state"] !== "working" && value["state"] !== "idle")) return false;
  const texts = [value["id"], value["title"], value["project"], value["model"], value["lastActivity"]];
  return (
    texts.every((text) => typeof text === "string") &&
    isNullableString(value["startedAt"]) &&
    typeof value["subagentCount"] === "number" &&
    Array.isArray(value["subagents"])
  );
}

/** The sessions of an /api/sessions answer; entries that do not have the expected shape are dropped. */
export function readSessions(data: unknown): Session[] {
  if (!isRecord(data) || !Array.isArray(data["sessions"])) return [];
  const list: unknown[] = data["sessions"];
  return list.filter(isSessionShape).map((session) => ({
    ...session,
    subagents: Array.isArray(session.subagents) ? session.subagents.filter(isSubagent) : [],
  }));
}
