import type { Session, Subagent, SubagentState } from "@subagent-city/shared";

export const STATE_LABELS: Record<SubagentState, string> = {
  working: "Working",
  recent: "Paused",
  done: "Done",
  idle: "Idle",
};

type ModelFamily = "opus" | "sonnet" | "haiku" | "fable";

/**
 * A model id as people say it: "claude-opus-4-5" → "Opus 4.5", "sonnet" → "Sonnet".
 * @param model - a model id or alias
 * @returns the short name, or "" when there is none
 */
export function formatModelName(model: string): string {
  const raw = model.trim().replace(/\[.*\]$/, "");
  if (!raw) return "";
  const match = /^(?:claude-)?(opus|sonnet|haiku|fable)(?:-(\d+)(?:-(\d+))?)?/i.exec(raw);
  const [, name, major, minor] = match ?? [];
  if (!name) return raw;
  const family = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  const version = major ? ` ${major}${minor && minor.length <= 2 ? `.${minor}` : ""}` : "";
  return family + version;
}

/** The model family in lower case, for colouring; null when unknown. */
export function readModelFamily(model: string): ModelFamily | null {
  const family = /(opus|sonnet|haiku|fable)/i.exec(model)?.[1]?.toLowerCase();
  return family ? (family as ModelFamily) : null;
}

/** "just now", "4 min ago", "2 h ago" from an ISO time; "" when the time is not readable. */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  if (ms < 45000) return "just now";
  if (ms < 3600000) return `${Math.round(ms / 60000)} min ago`;
  return `${Math.round(ms / 3600000)} h ago`;
}

/** The subagent's last step in one line: "Bash · npm test", its last words, or that it handed its work back. */
export function describeAction(sub: Subagent): string {
  const action = sub.lastAction;
  if (!action) return "";
  if (sub.state === "done" || /handback/i.test(action.tool)) return "Handed its result back to the session";
  return action.kind === "tool" ? [action.tool, action.detail].filter(Boolean).join(" · ") : `“${action.detail}”`;
}

export function formatCount(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** The sentence in the header: what the subagents are doing across the open sessions. */
export function formatSummary(sessions: readonly Session[] | null, isStale: boolean): string {
  if (isStale) return "Lost contact with the local server. Is it still running?";
  if (!sessions) return "Reading sessions…";
  if (!sessions.length) return "No open sessions";
  const all = sessions.flatMap((session) => session.subagentList);
  const countState = (state: SubagentState): number => all.filter((sub) => sub.state === state).length;
  return `${formatCount(countState("working"), "subagent")} working · ${countState("recent")} paused · ${countState("done")} done · in ${formatCount(sessions.length, "open session")}`;
}
