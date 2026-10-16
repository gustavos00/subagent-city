import type { Session } from "@subagent-city/shared";
import { useEffect, useState } from "react";
import { readSessions } from "../lib/guards";

const POLL_MS = 4000;
const TIMEOUT_MS = 5000;

interface SessionsState {
  sessions: Session[] | null;
  isStale: boolean;
}

async function fetchSessions(signal: AbortSignal): Promise<Session[]> {
  const response = await fetch("api/sessions", { cache: "no-store", signal });
  if (!response.ok) throw new Error(String(response.status));
  return readSessions(await response.json());
}

/** Polls /api/sessions every few seconds while the tab is visible; keeps the last good answer and flags it stale on failure. */
export function useSessions(): SessionsState {
  const [state, setState] = useState<SessionsState>({ sessions: null, isStale: false });

  useEffect(() => {
    let isDisposed = false;
    let isPolling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;

    const poll = async (): Promise<void> => {
      if (isPolling) return;
      isPolling = true;
      clearTimeout(timer);
      request = new AbortController();
      const current = request;
      const timeout = setTimeout(() => {
        current.abort();
      }, TIMEOUT_MS);
      try {
        const sessions = await fetchSessions(current.signal);
        if (!isDisposed) setState({ sessions, isStale: false });
      } catch {
        if (!isDisposed) setState((previous) => ({ ...previous, isStale: true }));
      } finally {
        clearTimeout(timeout);
        isPolling = false;
      }
      if (!isDisposed && !document.hidden) timer = setTimeout(() => void poll(), POLL_MS);
    };
    const handleVisibility = (): void => {
      if (!document.hidden) void poll();
    };

    void poll();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      isDisposed = true;
      request?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return state;
}
