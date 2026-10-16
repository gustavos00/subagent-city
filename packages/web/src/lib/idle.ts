import type { Session, Subagent } from "@subagent-city/shared";
import { sortActiveFirst } from "./sort";

interface FoldedSubagents {
  shown: Subagent[];
  /** Idle subagents the session has, including those the API listed no details for. */
  idleCount: number;
}

/**
 * Which subagents of a session are listed, and how many idle ones there are to show or hide.
 * The map and the side panel both use it, so their counts agree.
 */
export function foldIdleSubagents(session: Session, isExpanded: boolean): FoldedSubagents {
  const all = sortActiveFirst(session.subagents);
  const overflow = Math.max(0, session.subagentCount - all.length);
  const idleCount = all.filter((sub) => sub.state === "idle").length + overflow;
  return { shown: isExpanded ? all : all.filter((sub) => sub.state !== "idle"), idleCount };
}
