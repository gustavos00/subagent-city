import type { Subagent, SubagentState } from "@subagent-city/shared";
import { describeAction, formatAgo, STATE_LABELS } from "../lib/format";
import { ModelBadge } from "./ModelBadge";

const BORDERS: Record<SubagentState, string> = {
  working: "border-l-working",
  recent: "border-l-recent",
  done: "border-l-done",
  idle: "border-l-idle",
};

const LABEL_TONES: Record<SubagentState, string> = {
  working: "text-working",
  recent: "text-muted",
  done: "text-done",
  idle: "text-muted",
};

export function SubagentCard({ sub }: { sub: Subagent }) {
  const action = describeAction(sub);
  return (
    <li
      className={`grid min-w-0 gap-0.5 rounded-lg border border-l-4 border-border bg-inset px-3 py-2 [overflow-wrap:anywhere] ${BORDERS[sub.state]}`}
    >
      <span className={`text-[11px] font-bold tracking-wider uppercase ${LABEL_TONES[sub.state]}`}>
        {[STATE_LABELS[sub.state], formatAgo(sub.lastActivity)].filter(Boolean).join(" · ")}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{sub.name || "Unnamed"}</span>
        <ModelBadge model={sub.model} />
        {sub.type && sub.type !== "general-purpose" ? (
          <span className="rounded-full border border-dashed border-border px-[7px] text-[11px] text-muted">
            {sub.type}
          </span>
        ) : null}
      </span>
      {sub.task ? <span className="text-[13px] text-muted">{sub.task}</span> : null}
      {action ? (
        <span className="mt-0.5 rounded-md bg-white/3 px-1.5 py-1 font-mono text-xs leading-snug text-[#b9c2d6] [overflow-wrap:anywhere]">
          {action}
        </span>
      ) : null}
    </li>
  );
}
