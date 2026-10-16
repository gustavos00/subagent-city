import { render, screen } from "@testing-library/react";
import { App } from "./App";
import { createSession, createSubagent } from "./test/fixtures";

function mockFetch(handler: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function replyWith(sessions: unknown[]) {
  return new Response(JSON.stringify({ sessions, generatedAt: new Date().toISOString() }));
}

describe("App", () => {
  it("shows the summary and the sessions", async () => {
    mockFetch(() =>
      replyWith([
        createSession({
          id: "a",
          title: "Checkout",
          state: "working",
          subagentList: [
            createSubagent({ id: "1", name: "Maya" }),
            createSubagent({ id: "2", name: "Zoe", state: "done" }),
          ],
        }),
      ]),
    );
    render(<App />);
    expect(screen.getByText("Reading sessions…")).toBeInTheDocument();
    expect(await screen.findByText("1 subagent working · 0 paused · 1 done · in 1 open session")).toBeInTheDocument();
    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(screen.queryByText("No open Claude Code sessions")).not.toBeInTheDocument();
  });

  it("shows the empty state when no session is open", async () => {
    mockFetch(() => replyWith([]));
    render(<App />);
    expect(await screen.findByText("No open Claude Code sessions")).toBeInTheDocument();
    expect(screen.getByText("No open sessions")).toBeInTheDocument();
  });

  it("turns stale when the server cannot be reached", async () => {
    mockFetch(() => new Response("nope", { status: 500 }));
    render(<App />);
    expect(await screen.findByText("Lost contact with the local server. Is it still running?")).toBeInTheDocument();
    expect(screen.getByText("live").querySelector("i")).toHaveClass("bg-stale");
  });
});
