import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findModel, parseSubagentMeta, pickProjectName, pickSessionState, pickSubagentState, readLastAction, readOpenSessions } from "../src/sessions.mjs";

const SESSION = "11111111-2222-3333-4444-555555555555";
const line = (entry) => JSON.stringify(entry);

test("the project is the folder the session works in; a worktree counts as its repository", () => {
  assert.equal(pickProjectName("/home/ana/code/shop"), "shop");
  assert.equal(pickProjectName("/home/ana/code/shop/"), "shop");
  assert.equal(pickProjectName("/home/ana/code/shop/.claude/worktrees/brave-fox-12"), "shop");
  assert.equal(pickProjectName("C:\\code\\shop\\.claude\\worktrees\\brave"), "shop");
  assert.equal(pickProjectName(""), "");
});

test("a subagent's name comes from 'Name: task', or a capitalised first word", () => {
  assert.deepEqual(parseSubagentMeta({ description: "Ana: fix the login", model: "sonnet", agentType: "general-purpose" }), { name: "Ana", task: "fix the login", model: "sonnet", type: "general-purpose" });
  assert.equal(parseSubagentMeta({ description: "Bruno fixes the login" }).name, "Bruno");
  assert.equal(parseSubagentMeta({ description: "fix the login" }).name, "");
  assert.deepEqual(parseSubagentMeta(null), { name: "", task: "", model: "", type: "" });
});

test("the model is read from the transcript when the meta file has none", () => {
  const text = [line({ type: "user" }), line({ type: "assistant", message: { model: "claude-sonnet-4-5" } }), line({ type: "assistant", message: { model: "claude-opus-4-1" } })].join("\n");
  assert.equal(findModel(text), "claude-sonnet-4-5");
  assert.equal(findModel(text, true), "claude-opus-4-1");
  assert.equal(findModel("nothing here"), "");
});

test("the last action is the last tool call, or else the last words", () => {
  const tool = line({ type: "assistant", timestamp: "2026-01-01T10:00:00Z", message: { content: [{ type: "text", text: "Running tests" }, { type: "tool_use", name: "Bash", input: { command: "npm   test" } }] } });
  assert.deepEqual(readLastAction([line({ type: "user" }), tool, line({ type: "user", message: { content: [{ type: "tool_result" }] } })].join("\n")), { kind: "tool", tool: "Bash", detail: "npm test", at: "2026-01-01T10:00:00Z" });
  const file = line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "/repo/src/app.ts" } }] } });
  assert.equal(readLastAction(file).detail, "app.ts");
  const words = line({ type: "assistant", message: { content: [{ type: "text", text: "All done." }] } });
  assert.deepEqual(readLastAction(words), { kind: "text", tool: "", detail: "All done.", at: null });
  assert.equal(readLastAction("not json\n{broken"), null);
});

test("a subagent that handed its work back is done for an hour, then idle", () => {
  const handback = { kind: "tool", tool: "SubagentHandback", detail: "" };
  assert.equal(pickSubagentState(10_000, handback), "done");
  assert.equal(pickSubagentState(2 * 3600_000, handback), "idle");
  assert.equal(pickSubagentState(10_000, null), "working");
  assert.equal(pickSubagentState(10 * 60_000, null), "recent");
});

test("a session is working when its process says busy", () => {
  assert.equal(pickSessionState("busy", 10 * 60_000), "working");
  assert.equal(pickSessionState("idle", 0), "idle");
  assert.equal(pickSessionState(undefined, 1000), "working");
});

test("only sessions whose process is running are open, with their subagents", async () => {
  const claudeDir = await mkdtemp(join(tmpdir(), "subagent-city-"));
  try {
    const now = Date.now();
    await mkdir(join(claudeDir, "sessions"));
    await writeFile(join(claudeDir, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: SESSION, name: "Checkout revamp", status: "busy", cwd: "/code/shop", entrypoint: "cli", startedAt: now - 60_000 }));
    await writeFile(join(claudeDir, "sessions", "999999.json"), JSON.stringify({ pid: 999999, sessionId: "99999999-2222-3333-4444-555555555555", name: "Gone", status: "idle", cwd: "/x" }));
    await writeFile(join(claudeDir, "sessions", "1.json"), "{ half-written");
    const folder = join(claudeDir, "projects", "-code-shop");
    await mkdir(join(folder, SESSION, "subagents"), { recursive: true });
    await writeFile(join(folder, `${SESSION}.jsonl`), line({ type: "assistant", message: { model: "claude-opus-4-1" } }));
    const subs = join(folder, SESSION, "subagents");
    await writeFile(join(subs, "agent-a.jsonl"), [line({ type: "user", timestamp: "2026-01-01T10:00:00Z" }), line({ type: "assistant", message: { model: "claude-haiku-4-5", content: [{ type: "tool_use", name: "Read", input: { file_path: "/code/shop/cart.ts" } }] } })].join("\n"));
    await writeFile(join(subs, "agent-a.meta.json"), JSON.stringify({ description: "Ana: review the cart" }));
    await writeFile(join(subs, "agent-b.jsonl"), line({ type: "user" }));
    await writeFile(join(subs, "agent-b.meta.json"), JSON.stringify({ description: "Rui: old task", model: "sonnet" }));
    const old = new Date(now - 3 * 3600_000);
    await utimes(join(subs, "agent-b.jsonl"), old, old);

    const sessions = await readOpenSessions({ claudeDir, now });
    assert.equal(sessions.length, 1);
    const [session] = sessions;
    assert.equal(session.title, "Checkout revamp");
    assert.equal(session.project, "shop");
    assert.equal(session.state, "working");
    assert.equal(session.model, "claude-opus-4-1");
    assert.equal(session.subagents, 2);
    const [ana, rui] = session.subagentList;
    assert.equal(ana.name, "Ana");
    assert.equal(ana.model, "claude-haiku-4-5");
    assert.equal(ana.state, "working");
    assert.equal(ana.startedAt, "2026-01-01T10:00:00Z");
    assert.deepEqual(ana.lastAction, { kind: "tool", tool: "Read", detail: "cart.ts", at: null });
    assert.equal(rui.state, "idle");
    assert.equal(rui.model, "sonnet");
  } finally {
    await rm(claudeDir, { recursive: true, force: true });
  }
});

test("no Claude folder means no sessions, not an error", async () => {
  assert.deepEqual(await readOpenSessions({ claudeDir: join(tmpdir(), "does-not-exist-subagent-city") }), []);
});
