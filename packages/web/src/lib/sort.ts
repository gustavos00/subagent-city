import type { SubagentState } from "@subagent-city/shared";

const STATE_RANK: Record<SubagentState, number> = { working: 0, recent: 1, done: 2, idle: 3 };

/** A copy of the list with the busiest first, keeping the order within each state. */
export function sortActiveFirst<T extends { state: SubagentState }>(list: readonly T[]): T[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => STATE_RANK[a.item.state] - STATE_RANK[b.item.state] || a.index - b.index)
    .map((entry) => entry.item);
}
