import { createSession, createSubagent } from "../test/fixtures";
import { buildMapModel, placeMapNodes } from "../lib/layout";
import { convertToScreen } from "./geometry";
import { findNodeAt } from "./hitTest";

const cam = { x: 50, y: 50, k: 1 };
const session = createSession({
  id: "a",
  state: "working",
  subagents: [createSubagent({ id: "w", name: "Worker" }), createSubagent({ id: "i", name: "Sleeper", state: "idle" })],
});
const model = buildMapModel([session]);
const pos = placeMapNodes(model);

function readScreenPoint(id: string) {
  const at = pos.get(id);
  if (!at) throw new Error(`No position for ${id}`);
  return convertToScreen(at, cam);
}

describe("findNodeAt", () => {
  it("finds the session and the subagent under the point", () => {
    const s = readScreenPoint("s:a");
    expect(findNodeAt(model, pos, cam, s.x + 2, s.y)?.id).toBe("s:a");
    const a = readScreenPoint("a:a:w");
    expect(findNodeAt(model, pos, cam, a.x, a.y - 3)?.id).toBe("a:a:w");
  });

  it("returns null on empty space", () => {
    expect(findNodeAt(model, pos, cam, -500, -500)).toBeNull();
  });

  it("hits the idle pill along its whole drawn width and not beyond", () => {
    const p = readScreenPoint("idle:a");
    expect(findNodeAt(model, pos, cam, p.x + 20, p.y)?.id).toBe("idle:a");
    expect(findNodeAt(model, pos, cam, p.x + 300, p.y)).toBeNull();
  });
});
