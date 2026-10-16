import type { Session, Subagent } from "@subagent-city/shared";
import { createSession, createSubagent } from "../test/fixtures";
import { buildMapModel, layoutMap, PROJECT_GAP, ROW_STEP, sortActiveFirst, spreadApart } from "./layout";

const sub = (id: string, state: Subagent["state"]) => createSubagent({ id, name: id, state, model: "sonnet" });
const quiet: Session = createSession({
  id: "q",
  title: "Quiet",
  project: "shop",
  state: "idle",
  subagentList: [sub("old", "idle")],
});
const busy: Session = createSession({
  id: "b",
  title: "Busy",
  project: "shop",
  state: "working",
  subagentList: [sub("x", "idle"), sub("y", "done"), sub("z", "working")],
});

describe("layout", () => {
  it("puts the busiest first and keeps the order within a state", () => {
    const sorted = sortActiveFirst([sub("a", "idle"), sub("b", "working"), sub("c", "done"), sub("d", "working")]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("spreadApart keeps the order and the minimum gap, moving items as little as it can", () => {
    expect(spreadApart([0, 10, 200], 50)).toEqual([-20, 30, 200]);
    expect(spreadApart([0, 100], 50)).toEqual([0, 100]);
  });

  it("puts working sessions on top and folds idle subagents into one node until opened", () => {
    const model = buildMapModel([quiet, busy]);
    expect(model.nodes.filter((n) => n.type === "session").map((n) => n.id)).toEqual(["s:b", "s:q"]);
    expect(
      model.nodes.filter((n) => n.type !== "session" && n.type !== "project" && n.parent === "s:b").map((n) => n.id),
    ).toEqual(["a:b:z", "a:b:y", "idle:b"]);
    expect(model.nodes.find((n) => n.id === "idle:b")?.label).toBe("+1 idle");
    const open = buildMapModel([quiet, busy], new Set(["b"]));
    expect(open.nodes.some((n) => n.id === "a:b:x")).toBe(true);
    expect(model.edges.find((e) => e.to === "a:b:z")?.active).toBe(true);
    expect(model.nodes.filter((n) => n.type === "project")).toHaveLength(1);
  });

  it("keeps every column's nodes at least a row apart and puts the working session first", () => {
    const other = createSession({ id: "c", title: "Other", project: "blog", state: "idle", subagentList: [] });
    const model = buildMapModel([busy, quiet, other]);
    const pos = layoutMap(model);
    for (const col of [0, 1, 2]) {
      const ys = model.nodes
        .filter((n) => n.col === col)
        .map((n) => pos.get(n.id)?.y ?? NaN)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i += 1) {
        expect((ys[i] ?? NaN) - (ys[i - 1] ?? NaN)).toBeGreaterThanOrEqual(Math.min(ROW_STEP, PROJECT_GAP) - 1e-9);
      }
    }
    expect(pos.get("s:b")?.y).toBeLessThan(pos.get("s:q")?.y ?? NaN);
    expect(layoutMap(model)).toEqual(pos);
  });
});
