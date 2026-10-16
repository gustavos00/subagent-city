import { createSession, createSubagent } from "../test/fixtures";
import { readSessions } from "./guards";

describe("readSessions", () => {
  it("keeps well-formed sessions and drops the rest", () => {
    const good = createSession({ id: "ok", subagents: [createSubagent()] });
    const result = readSessions({ sessions: [good, { id: 1 }, null, "x"] });
    expect(result.map((session) => session.id)).toEqual(["ok"]);
  });

  it("drops malformed subagents but keeps the session", () => {
    const session = { ...createSession({ id: "ok" }), subagents: [createSubagent({ id: "good" }), { id: "bad" }] };
    expect(readSessions({ sessions: [session] })[0]?.subagents.map((sub) => sub.id)).toEqual(["good"]);
  });

  it("returns an empty list for anything that is not a sessions answer", () => {
    expect(readSessions(null)).toEqual([]);
    expect(readSessions({ sessions: "no" })).toEqual([]);
  });
});
