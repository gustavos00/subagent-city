import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createSession, createSubagent } from "../test/fixtures";
import { SessionPanel } from "./SessionPanel";

const sessions = [
  createSession({ id: "quiet", title: "Quick question", subagents: [] }),
  createSession({
    id: "calm",
    title: "Calm session",
    subagents: [createSubagent({ id: "d", name: "Done one", state: "done" })],
  }),
  createSession({
    id: "busy",
    title: "Busy session",
    state: "working",
    subagents: [
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
    expect(screen.getByRole("heading", { name: "Subagents by session" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sessions without subagents · 1" })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /^(Busy session|Calm session|Quick question)/ });
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName(/^Busy session/);
    expect(buttons[1]).toHaveAccessibleName(/^Calm session/);
    expect(buttons[2]).toHaveAccessibleName(/^Quick question/);
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
