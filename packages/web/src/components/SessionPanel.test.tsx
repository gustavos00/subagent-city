import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createSession, createSubagent } from "../test/fixtures";
import { SessionPanel } from "./SessionPanel";

const sessions = [
  createSession({ id: "quiet", title: "Quick question", subagentList: [] }),
  createSession({
    id: "calm",
    title: "Calm session",
    subagentList: [createSubagent({ id: "d", name: "Done one", state: "done" })],
  }),
  createSession({
    id: "busy",
    title: "Busy session",
    state: "working",
    subagentList: [
      createSubagent({ id: "w", name: "Worker" }),
      createSubagent({ id: "i", name: "Sleeper", state: "idle" }),
    ],
  }),
];

function Harness() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <SessionPanel
      sessions={sessions}
      expanded={expanded}
      selectedId={null}
      revealId={null}
      onSelect={() => undefined}
      onToggleIdle={(id) => {
        setExpanded(new Set(expanded.has(id) ? [] : [id]));
      }}
    />
  );
}

describe("SessionPanel", () => {
  it("groups sessions with subagents, busiest first, and then the quiet ones", () => {
    render(<Harness />);
    expect(screen.getByText("Subagents by session")).toBeInTheDocument();
    expect(screen.getByText("Sessions without subagents · 1")).toBeInTheDocument();
    const titles = screen.getAllByRole("button", { name: /session|question/i }).map((b) => b.textContent);
    expect(titles[0]).toContain("Busy session");
    expect(titles[1]).toContain("Calm session");
    expect(titles[2]).toContain("Quick question");
  });

  it("hides idle subagents until asked", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const busy = screen.getByRole("list", { name: "Subagents of Busy session" });
    expect(within(busy).queryByText("Sleeper")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 1 older" }));
    expect(
      within(screen.getByRole("list", { name: "Subagents of Busy session" })).getByText("Sleeper"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide 1 older" })).toHaveAttribute("aria-expanded", "true");
  });
});
