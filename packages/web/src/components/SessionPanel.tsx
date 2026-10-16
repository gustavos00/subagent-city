import type { Session } from "@subagent-city/shared";
import { useEffect, useRef } from "react";
import { QuietSession } from "./QuietSession";
import { SessionSection } from "./SessionSection";

interface SessionPanelProps {
  sessions: Session[];
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  revealId: string | null;
  onSelect: (sessionId: string) => void;
  onToggleIdle: (sessionId: string) => void;
}

function readBusyScore(session: Session): number {
  const working = session.subagents.filter((sub) => sub.state === "working").length;
  const active = session.subagents.filter((sub) => sub.state !== "idle").length;
  return working * 1000 + active;
}

export function SessionPanel({ sessions, expanded, selectedId, revealId, onSelect, onToggleIdle }: SessionPanelProps) {
  const listRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!revealId) return;
    listRef.current?.querySelector(`[data-session="${CSS.escape(revealId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [revealId]);

  const withSubagents = sessions
    .filter((session) => session.subagentCount > 0)
    .map((session, index) => ({ session, index }))
    .sort((a, b) => readBusyScore(b.session) - readBusyScore(a.session) || a.index - b.index)
    .map((entry) => entry.session);
  const quiet = sessions.filter((session) => !session.subagentCount);
  const titleClass = "mx-0.5 mt-1.5 mb-0 text-xs font-bold tracking-wider text-muted uppercase";
  const listClass = "m-0 grid list-none gap-2.5 p-0";

  return (
    <aside
      ref={listRef}
      aria-label="Subagents"
      className="grid content-start gap-2.5 overflow-y-auto border-t border-border bg-surface p-3 min-[821px]:border-t-0 min-[821px]:border-l"
    >
      {withSubagents.length ? (
        <section className="grid gap-2.5">
          <h2 className={titleClass}>Subagents by session</h2>
          <ul className={listClass}>
            {withSubagents.map((session) => (
              <SessionSection
                key={session.id}
                session={session}
                isSelected={selectedId === session.id}
                isExpanded={expanded.has(session.id)}
                onSelect={onSelect}
                onToggleIdle={onToggleIdle}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {quiet.length ? (
        <section className="grid gap-2.5">
          <h2 className={titleClass}>{`Sessions without subagents · ${quiet.length}`}</h2>
          <ul className={listClass}>
            {quiet.map((session) => (
              <QuietSession
                key={session.id}
                session={session}
                isSelected={selectedId === session.id}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
