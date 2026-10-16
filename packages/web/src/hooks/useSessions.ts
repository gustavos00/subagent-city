import type { Session, SessionsResponse } from "@subagent-city/shared";
import { useEffect, useState } from "react";

const POLL_MS = 4000;

interface SessionsState {
  sessions: Session[] | null;
  isStale: boolean;
}

async function fetchSessions(signal: AbortSignal): Promise<Session[]> {
  const response = await fetch("api/sessions", { cache: "no-store", signal });
  if (!response.ok) throw new Error(String(response.status));
  const data = (await response.json()) as Partial<SessionsResponse>;
  return Array.isArray(data.sessions) ? data.sessions : [];
}

/** Polls /api/sessions; keeps the last good answer and flags the connection as stale when a poll fails. */
export function useSessions(): SessionsState {
  const [state, setState] = useState<SessionsState>({ sessions: null, isStale: false });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const sessions = await fetchSessions(controller.signal);
        setState({ sessions, isStale: false });
      } catch {
        if (controller.signal.aborted) return;
        setState((previous) => ({ ...previous, isStale: true }));
      }
      timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return state;
}
