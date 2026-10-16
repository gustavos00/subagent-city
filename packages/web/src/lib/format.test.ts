import { createSession, createSubagent } from "../test/fixtures";
import { describeAction, formatAgo, formatCount, formatModelName, formatSummary, readModelFamily } from "./format";

describe("formatModelName", () => {
  it("reads model ids the way people say them", () => {
    expect(formatModelName("claude-opus-4-5")).toBe("Opus 4.5");
    expect(formatModelName("claude-sonnet-4-5-20250929")).toBe("Sonnet 4.5");
    expect(formatModelName("sonnet")).toBe("Sonnet");
    expect(formatModelName("claude-haiku-4-5[1m]")).toBe("Haiku 4.5");
    expect(formatModelName("gpt-x")).toBe("gpt-x");
    expect(formatModelName("")).toBe("");
  });
});

describe("readModelFamily", () => {
  it("finds the family or null", () => {
    expect(readModelFamily("claude-opus-4-5")).toBe("opus");
    expect(readModelFamily("HAIKU")).toBe("haiku");
    expect(readModelFamily("gpt-x")).toBeNull();
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  it("says just now, minutes and hours", () => {
    expect(formatAgo("2026-01-01T11:59:30Z", now)).toBe("just now");
    expect(formatAgo("2026-01-01T11:56:00Z", now)).toBe("4 min ago");
    expect(formatAgo("2026-01-01T10:00:00Z", now)).toBe("2 h ago");
  });
  it("is empty for an unreadable time", () => {
    expect(formatAgo("nope", now)).toBe("");
  });
});

describe("describeAction", () => {
  it("is empty without an action", () => {
    expect(describeAction(createSubagent())).toBe("");
  });
  it("joins tool and detail", () => {
    const lastAction = { kind: "tool" as const, tool: "Bash", detail: "npm test", at: null };
    expect(describeAction(createSubagent({ lastAction }))).toBe("Bash · npm test");
  });
  it("quotes the last words", () => {
    const lastAction = { kind: "text" as const, detail: "All good", at: null };
    expect(describeAction(createSubagent({ lastAction }))).toBe("“All good”");
  });
  it("says it handed its result back when done or after a handback", () => {
    const lastAction = { kind: "tool" as const, tool: "SubagentHandback", detail: "", at: null };
    expect(describeAction(createSubagent({ lastAction }))).toBe("Handed its result back to the session");
    expect(describeAction(createSubagent({ state: "done", lastAction: { ...lastAction, tool: "Bash" } }))).toBe(
      "Handed its result back to the session",
    );
  });
});

describe("formatSummary", () => {
  it("covers loading, stale, empty and counts", () => {
    expect(formatSummary(null, false)).toBe("Reading sessions…");
    expect(formatSummary(null, true)).toBe("Lost contact with the local server. Is it still running?");
    expect(formatSummary([], false)).toBe("No open sessions");
    const sessions = [
      createSession({
        id: "a",
        subagents: [createSubagent({ id: "1" }), createSubagent({ id: "2", state: "done" })],
      }),
    ];
    expect(formatSummary(sessions, false)).toBe("1 subagent working · 0 paused · 1 done · in 1 open session");
  });
  it("pluralises", () => {
    expect(formatCount(2, "subagent")).toBe("2 subagents");
  });
});
