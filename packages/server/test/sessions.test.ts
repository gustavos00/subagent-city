import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  findFirstModel,
  findLastModel,
  parseSubagentMeta,
  pickProjectName,
  pickSessionState,
  pickSubagentState,
  readLastAction,
  readOpenSessions,
} from "../src/sessions.js";

const SESSION = "11111111-2222-3333-4444-555555555555";

function buildLine(entry: unknown): string {
  return JSON.stringify(entry);
}

test("the project is the folder the session works in; a worktree counts as its repository", () => {
  expect(pickProjectName("/home/ana/code/shop")).toBe("shop");
  expect(pickProjectName("/home/ana/code/shop/")).toBe("shop");
  expect(pickProjectName("/home/ana/code/shop/.claude/worktrees/brave-fox-12")).toBe("shop");
  expect(pickProjectName("C:\\code\\shop\\.claude\\worktrees\\brave")).toBe("shop");
  expect(pickProjectName("")).toBe("");
});

test("a subagent's name comes from 'Name: task', or a capitalised first word", () => {
  expect(
    parseSubagentMeta({ description: "Ana: fix the login", model: "sonnet", agentType: "general-purpose" }),
  ).toEqual({ name: "Ana", task: "fix the login", model: "sonnet", type: "general-purpose" });
  expect(parseSubagentMeta({ description: "Bruno fixes the login" }).name).toBe("Bruno");
  expect(parseSubagentMeta({ description: "fix the login" }).name).toBe("");
  expect(parseSubagentMeta(null)).toEqual({ name: "", task: "", model: "", type: "" });
});

test("the model is read from the transcript when the meta file has none", () => {
  const text = [
    buildLine({ type: "user" }),
    buildLine({ type: "assistant", message: { model: "claude-sonnet-4-5" } }),
    buildLine({ type: "assistant", message: { model: "claude-opus-4-1" } }),
  ].join("\n");
  expect(findFirstModel(text)).toBe("claude-sonnet-4-5");
  expect(findLastModel(text)).toBe("claude-opus-4-1");
  expect(findFirstModel("nothing here")).toBe("");
  expect(findLastModel("nothing here")).toBe("");
});

test("the last action is the last tool call, or else the last words", () => {
  const tool = buildLine({
    type: "assistant",
    timestamp: "2026-01-01T10:00:00Z",
    message: {
      content: [
        { type: "text", text: "Running tests" },
        { type: "tool_use", name: "Bash", input: { command: "npm   test" } },
      ],
    },
  });
  const tail = [
    buildLine({ type: "user" }),
    tool,
    buildLine({ type: "user", message: { content: [{ type: "tool_result" }] } }),
  ];
  expect(readLastAction(tail.join("\n"))).toEqual({
    kind: "tool",
    tool: "Bash",
    detail: "npm test",
    at: "2026-01-01T10:00:00Z",
  });
  const file = buildLine({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "/repo/src/app.ts" } }] },
  });
  expect(readLastAction(file)?.detail).toBe("app.ts");
  const words = buildLine({ type: "assistant", message: { content: [{ type: "text", text: "All done." }] } });
  expect(readLastAction(words)).toEqual({ kind: "text", detail: "All done.", at: null });
  expect(readLastAction("not json\n{broken")).toBeNull();
});

test("a subagent that handed its work back is done for an hour, then idle", () => {
  const handback = { kind: "tool", tool: "SubagentHandback", detail: "", at: null } as const;
  expect(pickSubagentState(10_000, handback)).toBe("done");
  expect(pickSubagentState(2 * 3600_000, handback)).toBe("idle");
  expect(pickSubagentState(10_000, null)).toBe("working");
  expect(pickSubagentState(10 * 60_000, null)).toBe("recent");
});

test("a session is working when its process says busy", () => {
  expect(pickSessionState("busy", 10 * 60_000)).toBe("working");
  expect(pickSessionState("idle", 0)).toBe("idle");
  expect(pickSessionState(undefined, 1000)).toBe("working");
});

test("only sessions whose process is running are open, with their subagents", async () => {
  const claudeDir = await mkdtemp(join(tmpdir(), "subagent-city-"));
  try {
    const now = Date.now();
    await mkdir(join(claudeDir, "sessions"));
    await writeFile(
      join(claudeDir, "sessions", `${process.pid}.json`),
      JSON.stringify({
        pid: process.pid,
        sessionId: SESSION,
        name: "Checkout revamp",
        status: "busy",
        cwd: "/code/shop",
        entrypoint: "cli",
        startedAt: now - 60_000,
      }),
    );
    await writeFile(
      join(claudeDir, "sessions", "999999.json"),
      JSON.stringify({
        pid: 999999,
        sessionId: "99999999-2222-3333-4444-555555555555",
        name: "Gone",
        status: "idle",
        cwd: "/x",
      }),
    );
    await writeFile(join(claudeDir, "sessions", "1.json"), "{ half-written");
    const folder = join(claudeDir, "projects", "-code-shop");
    await mkdir(join(folder, SESSION, "subagents"), { recursive: true });
    await writeFile(
      join(folder, `${SESSION}.jsonl`),
      buildLine({ type: "assistant", message: { model: "claude-opus-4-1" } }),
    );
    const subs = join(folder, SESSION, "subagents");
    await writeFile(
      join(subs, "agent-a.jsonl"),
      [
        buildLine({ type: "user", timestamp: "2026-01-01T10:00:00Z" }),
        buildLine({
          type: "assistant",
          message: {
            model: "claude-haiku-4-5",
            content: [{ type: "tool_use", name: "Read", input: { file_path: "/code/shop/cart.ts" } }],
          },
        }),
      ].join("\n"),
    );
    await writeFile(join(subs, "agent-a.meta.json"), JSON.stringify({ description: "Ana: review the cart" }));
    await writeFile(join(subs, "agent-b.jsonl"), buildLine({ type: "user" }));
    await writeFile(join(subs, "agent-b.meta.json"), JSON.stringify({ description: "Rui: old task", model: "sonnet" }));
    const old = new Date(now - 3 * 3600_000);
    await utimes(join(subs, "agent-b.jsonl"), old, old);

    const sessions = await readOpenSessions({ claudeDir, now });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      title: "Checkout revamp",
      project: "shop",
      state: "working",
      model: "claude-opus-4-1",
      subagentCount: 2,
    });
    expect(sessions[0]?.subagents).toMatchObject([
      {
        name: "Ana",
        model: "claude-haiku-4-5",
        state: "working",
        startedAt: "2026-01-01T10:00:00Z",
        lastAction: { kind: "tool", tool: "Read", detail: "cart.ts", at: null },
      },
      { state: "idle", model: "sonnet" },
    ]);
  } finally {
    await rm(claudeDir, { recursive: true, force: true });
  }
});

test("no Claude folder means no sessions, not an error", async () => {
  expect(await readOpenSessions({ claudeDir: join(tmpdir(), "does-not-exist-subagent-city") })).toEqual([]);
});

test("a tail that starts in the middle of a line still yields the last action", () => {
  const whole = buildLine({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } }] },
  });
  const tail = `${whole.slice(20)}\n${whole}`;
  expect(readLastAction(tail)).toEqual({ kind: "tool", tool: "Read", detail: "b.ts", at: null });
  expect(readLastAction(whole.slice(20))).toBeNull();
});

test("a transcript that has not changed is not read again", async () => {
  const claudeDir = await mkdtemp(join(tmpdir(), "subagent-city-"));
  try {
    const folder = join(claudeDir, "projects", "-code-shop");
    const subs = join(folder, SESSION, "subagents");
    await mkdir(join(claudeDir, "sessions"));
    await mkdir(subs, { recursive: true });
    await writeFile(
      join(claudeDir, "sessions", `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: SESSION, status: "idle", cwd: "/code/shop" }),
    );
    await writeFile(join(folder, `${SESSION}.jsonl`), buildLine({ type: "user" }));
    const file = join(subs, "agent-a.jsonl");
    const writeAction = (tool: string) =>
      writeFile(
        file,
        buildLine({ type: "assistant", message: { content: [{ type: "tool_use", name: tool, input: {} }] } }),
      );
    const fixed = new Date(Date.now() - 5 * 60_000);
    await writeAction("First");
    await utimes(file, fixed, fixed);

    const lastTool = async () => (await readOpenSessions({ claudeDir }))[0]?.subagents[0]?.lastAction;
    expect(await lastTool()).toMatchObject({ tool: "First" });

    await writeAction("Second");
    await utimes(file, fixed, fixed);
    expect(await lastTool()).toMatchObject({ tool: "First" });

    await utimes(file, new Date(fixed.getTime() + 1000), new Date(fixed.getTime() + 1000));
    expect(await lastTool()).toMatchObject({ tool: "Second" });
  } finally {
    await rm(claudeDir, { recursive: true, force: true });
  }
});
