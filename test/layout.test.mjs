import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMapModel, formatModelName, layoutMap, PROJECT_GAP, ROW_STEP, sortActiveFirst, spreadApart } from "../public/layout.js";

const sub = (id, state, extra = {}) => ({ id, name: id, state, model: "sonnet", ...extra });
const quiet = { id: "q", title: "Quiet", project: "shop", state: "idle", subagents: 1, subagentList: [sub("old", "idle")] };
const busy = { id: "b", title: "Busy", project: "shop", state: "working", subagents: 3, subagentList: [sub("x", "idle"), sub("y", "done"), sub("z", "working")] };

test("model names read the way people say them", () => {
  assert.equal(formatModelName("claude-opus-4-5"), "Opus 4.5");
  assert.equal(formatModelName("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
  assert.equal(formatModelName("sonnet"), "Sonnet");
  assert.equal(formatModelName("claude-haiku-4-5[1m]"), "Haiku 4.5");
  assert.equal(formatModelName("gpt-x"), "gpt-x");
  assert.equal(formatModelName(""), "");
});

test("the busiest come first and the order is kept within a state", () => {
  assert.deepEqual(sortActiveFirst([sub("a", "idle"), sub("b", "working"), sub("c", "done"), sub("d", "working")]).map((s) => s.id), ["b", "d", "c", "a"]);
});

test("spreadApart keeps the order and the minimum gap, moving items as little as it can", () => {
  assert.deepEqual(spreadApart([0, 10, 200], 50), [-20, 30, 200]);
  assert.deepEqual(spreadApart([0, 100], 50), [0, 100]);
});

test("working sessions sit on top; idle subagents fold into one node until opened", () => {
  const model = buildMapModel([quiet, busy]);
  assert.deepEqual(model.nodes.filter((n) => n.type === "session").map((n) => n.id), ["s:b", "s:q"]);
  assert.deepEqual(model.nodes.filter((n) => n.parent === "s:b").map((n) => n.id), ["a:b:z", "a:b:y", "idle:b"]);
  assert.equal(model.nodes.find((n) => n.id === "idle:b").label, "+1 idle");
  const open = buildMapModel([quiet, busy], new Set(["b"]));
  assert.ok(open.nodes.some((n) => n.id === "a:b:x"));
  assert.equal(model.edges.find((e) => e.to === "a:b:z").active, true);
  assert.equal(model.nodes.filter((n) => n.type === "project").length, 1);
});

test("the layout keeps every column's nodes at least a row apart and puts the working session first", () => {
  const sessions = [busy, quiet, { id: "c", title: "Other", project: "blog", state: "idle", subagents: 0, subagentList: [] }];
  const model = buildMapModel(sessions);
  const pos = layoutMap(model);
  for (const col of [0, 1, 2]) {
    const ys = model.nodes.filter((n) => n.col === col).map((n) => pos.get(n.id).y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i] - ys[i - 1] >= Math.min(ROW_STEP, PROJECT_GAP) - 1e-9);
  }
  assert.ok(pos.get("s:b").y < pos.get("s:q").y);
  assert.deepEqual(layoutMap(model), pos);
});
