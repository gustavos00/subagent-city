import { render, screen } from "@testing-library/react";
import { createSubagent } from "../test/fixtures";
import { SubagentCard } from "./SubagentCard";

describe("SubagentCard", () => {
  it("shows the name, model badge, state, task and last action", () => {
    const lastAction = { kind: "tool" as const, tool: "Bash", detail: "npm test", at: null };
    render(
      <ul>
        <SubagentCard sub={createSubagent({ name: "Leo", model: "claude-opus-4-5", lastAction })} />
      </ul>,
    );
    expect(screen.getByText("Leo")).toBeInTheDocument();
    expect(screen.getByTitle("Model")).toHaveTextContent("Opus 4.5");
    expect(screen.getByText(/^Working/)).toBeInTheDocument();
    expect(screen.getByText("build the drawer")).toBeInTheDocument();
    expect(screen.getByText("Bash · npm test")).toBeInTheDocument();
  });

  it("says a done subagent handed its result back", () => {
    const lastAction = { kind: "text" as const, tool: "", detail: "ok", at: null };
    render(
      <ul>
        <SubagentCard sub={createSubagent({ state: "done", lastAction })} />
      </ul>,
    );
    expect(screen.getByText(/^Done/)).toBeInTheDocument();
    expect(screen.getByText("Handed its result back to the session")).toBeInTheDocument();
  });
});
