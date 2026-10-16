import { createSession, createSubagent } from "../test/fixtures";
import { foldIdleSubagents } from "./idle";

const subagents = [
  createSubagent({ id: "i", state: "idle" }),
  createSubagent({ id: "d", state: "done" }),
  createSubagent({ id: "w", state: "working" }),
];

describe("foldIdleSubagents", () => {
  it("lists the active ones, busiest first, and counts the idle ones", () => {
    const { shown, idleCount } = foldIdleSubagents(createSession({ subagents }), false);
    expect(shown.map((sub) => sub.id)).toEqual(["w", "d"]);
    expect(idleCount).toBe(1);
  });

  it("lists every subagent when expanded and keeps the idle count", () => {
    const { shown, idleCount } = foldIdleSubagents(createSession({ subagents }), true);
    expect(shown.map((sub) => sub.id)).toEqual(["w", "d", "i"]);
    expect(idleCount).toBe(1);
  });

  it("counts subagents the API reported but gave no details for as idle", () => {
    const { shown, idleCount } = foldIdleSubagents(createSession({ subagents, subagentCount: 6 }), false);
    expect(shown).toHaveLength(2);
    expect(idleCount).toBe(4);
  });
});
