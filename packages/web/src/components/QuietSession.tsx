import type { Session } from "@subagent-city/shared";
import { StateDot } from "./StateDot";

interface QuietSessionProps {
  session: Session;
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
}

export function QuietSession({ session, isSelected, onSelect }: QuietSessionProps) {
  return (
    <li
      data-session={session.id}
      className={`rounded-[10px] border bg-card ${isSelected ? "border-recent" : "border-border"}`}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => {
          onSelect(session.id);
        }}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 border-0 bg-transparent px-3 py-2 text-left"
      >
        <StateDot state={session.state} />
        <span>{session.title}</span>
        <span className="text-[13px] text-muted">{session.project}</span>
      </button>
    </li>
  );
}
