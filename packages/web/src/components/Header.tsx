import type { Session } from "@subagent-city/shared";
import { formatSummary } from "../lib/format";
import { LiveIndicator } from "./LiveIndicator";

interface HeaderProps {
  sessions: Session[] | null;
  isStale: boolean;
}

export function Header({ sessions, isStale }: HeaderProps) {
  return (
    <header className="flex items-center gap-4 border-b border-border px-4 py-2.5">
      <h1 className="m-0 flex items-center gap-2 text-[17px]">
        <img src="icon.svg" alt="" width={20} height={20} /> Subagent City
      </h1>
      <p aria-live="polite" className="m-0 min-w-0 flex-1 truncate text-muted">
        {formatSummary(sessions, isStale)}
      </p>
      <LiveIndicator isStale={isStale} />
    </header>
  );
}
