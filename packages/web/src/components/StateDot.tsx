import type { SubagentState } from "@subagent-city/shared";

const TONES: Record<SubagentState, string> = {
  working: "bg-working shadow-[0_0_8px_var(--color-working)]",
  recent: "bg-recent",
  done: "bg-done",
  idle: "bg-idle",
};

export function StateDot({ state }: { state: SubagentState }) {
  return <span aria-hidden="true" className={`size-[9px] flex-none rounded-full ${TONES[state]}`} />;
}
