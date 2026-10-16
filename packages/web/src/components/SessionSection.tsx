import type { Session } from "@subagent-city/shared";
import { formatCount, STATE_LABELS } from "../lib/format";
import { ModelBadge } from "./ModelBadge";
import { StateDot } from "./StateDot";
import { SubagentCard } from "./SubagentCard";

interface SessionSectionProps {
  session: Session;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (sessionId: string) => void;
  onToggleIdle: (sessionId: string) => void;
}

export function SessionSection({ session, isSelected, isExpanded, onSelect, onToggleIdle }: SessionSectionProps) {
  const shown = isExpanded ? session.subagentList : session.subagentList.filter((sub) => sub.state !== "idle");
  const idleCount = session.subagentList.filter((sub) => sub.state === "idle").length;
  const meta = [
    `Session ${STATE_LABELS[session.state].toLowerCase()}`,
    session.project,
    formatCount(session.subagents, "subagent"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      data-session={session.id}
      aria-current={isSelected ? "true" : undefined}
      className={`rounded-[10px] border bg-card ${isSelected ? "border-recent shadow-[inset_0_0_0_1px_var(--color-recent)]" : "border-border"}`}
    >
      <button
        type="button"
        onClick={() => {
          onSelect(session.id);
        }}
        className="grid w-full cursor-pointer gap-0.5 rounded-[10px] border-0 bg-transparent px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[15px] font-bold [overflow-wrap:anywhere]">
          <StateDot state={session.state} />
          <span>{session.title}</span>
          <ModelBadge model={session.model} />
        </span>
        <span className="text-[13px] text-muted">{meta}</span>
      </button>
      {shown.length ? (
        <ul aria-label={`Subagents of ${session.title}`} className="m-0 grid list-none gap-2 px-2.5 pt-0 pb-2.5">
          {shown.map((sub) => (
            <SubagentCard key={sub.id} sub={sub} />
          ))}
        </ul>
      ) : (
        <p className="m-0 px-3 pb-3 text-[13px] text-muted">No subagent active in the last hour.</p>
      )}
      {idleCount ? (
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => {
            onToggleIdle(session.id);
          }}
          className="mx-3 mb-3 cursor-pointer rounded-full border border-border bg-transparent px-2.5 py-1 text-xs text-muted hover:border-muted hover:text-text"
        >
          {isExpanded ? `Hide ${idleCount} older` : `Show ${idleCount} older`}
        </button>
      ) : null}
    </li>
  );
}
