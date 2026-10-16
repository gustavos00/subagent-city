import { useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { SessionPanel } from "./components/SessionPanel";
import { useSessions } from "./hooks/useSessions";
import { MapCanvas } from "./map/MapCanvas";

export function App() {
  const { sessions, isStale } = useSessions();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);

  const list = sessions ?? [];
  const selectedId = list.some((session) => session.id === pickedId) ? pickedId : null;

  const handleToggleIdle = (sessionId: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(sessionId)) next.add(sessionId);
      return next;
    });
  };

  const handleSelectFromPanel = (sessionId: string) => {
    setPickedId(selectedId === sessionId ? null : sessionId);
    setRevealId(null);
  };

  const handleSelectFromMap = (sessionId: string) => {
    const next = selectedId === sessionId ? null : sessionId;
    setPickedId(next);
    setRevealId(next);
  };

  return (
    <div className="flex h-full flex-col">
      <Header sessions={sessions} isStale={isStale} />
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[55vh_auto] min-[821px]:grid-cols-[minmax(0,1fr)_420px] min-[821px]:grid-rows-none">
        <MapCanvas
          sessions={list}
          expanded={expanded}
          selectedId={selectedId}
          onSelectSession={handleSelectFromMap}
          onToggleIdle={handleToggleIdle}
        >
          {sessions?.length === 0 ? <EmptyState /> : null}
        </MapCanvas>
        <SessionPanel
          sessions={list}
          expanded={expanded}
          selectedId={selectedId}
          revealId={revealId}
          onSelect={handleSelectFromPanel}
          onToggleIdle={handleToggleIdle}
        />
      </main>
    </div>
  );
}
