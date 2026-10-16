// Reads which Claude Code sessions are open on this machine, and the subagents each one has started.
//
// Sources (all local, read-only):
//   ~/.claude/sessions/<pid>.json                          one file per running Claude Code process
//   ~/.claude/projects/<folder>/<sessionId>.jsonl          the session's transcript (only its head and tail are read)
//   ~/.claude/projects/<folder>/<sessionId>/subagents/     one transcript (+ .meta.json) per subagent
//
// These are Claude Code's own files, not a public API: every field is read defensively and missing ones are left empty.
import { execFile } from "node:child_process";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORKING_MS = 90 * 1000;
const RECENT_MS = 60 * 60 * 1000;
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 256 * 1024;
const MAX_SUBAGENTS = 40;
const MAX_NAME = 24;

export function resolveClaudeDir() {
  return process.env.SUBAGENT_CITY_CLAUDE_DIR ?? join(homedir(), ".claude");
}

/**
 * The project a session works on, from its working directory. A worktree counts as the repository it belongs to.
 * @param cwd - the session's working directory
 * @returns the folder name, or "" when there is no cwd
 */
export function pickProjectName(cwd) {
  if (typeof cwd !== "string" || !cwd.trim()) return "";
  const path = cwd.replace(/[\\/]+$/, "");
  const worktree = /^(.*?)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/.exec(path) ?? /^(.*?)[\\/]\.claude-worktrees[\\/]([^\\/]+)[\\/][^\\/]+$/.exec(path);
  if (worktree) return worktree[2] ?? readLastSegment(worktree[1]);
  return readLastSegment(path);
}

/** The last part of a path, with / or \ as separators (a Windows path read on any system). */
function readLastSegment(path) {
  return path.split(/[\\/]/).pop() ?? "";
}

/**
 * How busy something is from how long ago its transcript last changed.
 * @param ageMs - milliseconds since the last write
 * @returns "working", "recent" or "idle"
 */
export function pickActivity(ageMs) {
  return ageMs <= WORKING_MS ? "working" : ageMs <= RECENT_MS ? "recent" : "idle";
}

/**
 * A subagent's state: "done" once it has handed its work back (for an hour, then "idle"), otherwise by how recently it wrote.
 * @param ageMs - milliseconds since its transcript last changed
 * @param lastAction - from readLastAction, or null
 * @returns "working", "recent", "done" or "idle"
 */
export function pickSubagentState(ageMs, lastAction) {
  if (isHandback(lastAction)) return ageMs <= RECENT_MS ? "done" : "idle";
  return pickActivity(ageMs);
}

/** Whether a subagent's last action was handing its result back to the session that started it. */
export function isHandback(lastAction) {
  return lastAction?.kind === "tool" && /handback/i.test(lastAction.tool);
}

/**
 * A session's state from what its process reports, falling back to the transcript's age when the process says nothing.
 * @param status - the process's own status ("busy", "idle", ...), or undefined
 * @param ageMs - milliseconds since the transcript last changed
 * @returns "working" or "idle"
 */
export function pickSessionState(status, ageMs) {
  if (status === "busy") return "working";
  if (typeof status === "string" && status) return "idle";
  return ageMs <= WORKING_MS ? "working" : "idle";
}

/**
 * The name, task and model of one subagent from its meta file. A description reads "Name: task"; without a colon the
 * first word is a name only when it is capitalised.
 * @param meta - the parsed .meta.json, or null
 * @returns { name, task, model, type }
 */
export function parseSubagentMeta(meta) {
  const description = typeof meta?.description === "string" ? meta.description.trim() : "";
  const model = typeof meta?.model === "string" ? meta.model : "";
  const type = typeof meta?.agentType === "string" ? meta.agentType : "";
  const colon = description.indexOf(":");
  if (colon > 0) {
    const name = description.slice(0, colon).trim();
    if (name) return { name: name.slice(0, MAX_NAME), task: description.slice(colon + 1).trim(), model, type };
  }
  const first = description.split(/\s+/)[0] ?? "";
  if (/^\p{Lu}[\p{L}'-]*$/u.test(first) && first.length <= MAX_NAME) return { name: first, task: description.slice(first.length).trim(), model, type };
  return { name: "", task: description, model, type };
}

/**
 * The first or last model named in a chunk of transcript.
 * @param text - some JSONL lines
 * @param last - true for the last one (the model now), false for the first
 * @returns a model id such as "claude-sonnet-4-5", or ""
 */
export function findModel(text, last = false) {
  const all = [...String(text).matchAll(/"model":"(claude-[^"]+)"/g)];
  if (!all.length) return "";
  return (last ? all[all.length - 1] : all[0])[1];
}

/** A short, one-line account of what a tool call does, from its input. */
function describeToolInput(input) {
  if (!input || typeof input !== "object") return "";
  const value = input.description ?? input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query ?? input.prompt ?? "";
  const text = typeof value === "string" ? value : "";
  const short = /^(\/|[A-Za-z]:\\)/.test(text) && !/\s/.test(text) ? readLastSegment(text) : text;
  return short.replace(/\s+/g, " ").trim().slice(0, 90);
}

/**
 * What a subagent did last, from the tail of its transcript: its last tool call, or else its last words.
 * @param text - the last JSONL lines of the transcript
 * @returns { kind: "tool" | "text", tool, detail, at } or null
 */
export function readLastAction(text) {
  const lines = String(text).split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes('"type":"assistant"')) continue;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const content = Array.isArray(entry?.message?.content) ? entry.message.content : [];
    const at = typeof entry.timestamp === "string" ? entry.timestamp : null;
    const tool = [...content].reverse().find((block) => block?.type === "tool_use");
    if (tool) return { kind: "tool", tool: String(tool.name ?? ""), detail: describeToolInput(tool.input), at };
    const words = content.filter((block) => block?.type === "text").map((block) => block.text).join(" ").replace(/\s+/g, " ").trim();
    if (words) return { kind: "text", tool: "", detail: words.slice(0, 140), at };
  }
  return null;
}

/** When a transcript starts: the first timestamp in its head, as an ISO string, or null. */
export function readFirstTimestamp(text) {
  return /"timestamp":"([^"]+)"/.exec(String(text))?.[1] ?? null;
}

async function readChunk(file, fromEnd) {
  let handle;
  try {
    handle = await open(file, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, fromEnd ? TAIL_BYTES : HEAD_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, fromEnd ? size - length : 0);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close();
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function readMemory(pids) {
  if (!pids.length || process.platform === "win32") return Promise.resolve(new Map());
  return new Promise((resolve) => {
    execFile("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], { timeout: 4000 }, (_error, stdout) => {
      const rss = new Map();
      for (const line of String(stdout ?? "").split("\n")) {
        const match = /^\s*(\d+)\s+(\d+)/.exec(line);
        if (match) rss.set(Number(match[1]), Math.round(Number(match[2]) / 1024));
      }
      resolve(rss);
    });
  });
}

/**
 * The Claude Code processes running now, one per open session.
 * @param dir - the folder with the <pid>.json files
 * @returns [{ pid, sessionId, name, status, cwd, entrypoint, startedAt }]
 */
export async function readOpenProcesses(dir) {
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f));
  } catch {
    return [];
  }
  const found = [];
  for (const file of files) {
    const entry = await readJson(join(dir, file));
    if (!entry || !Number.isInteger(entry.pid) || !SESSION_ID.test(entry.sessionId ?? "") || !isAlive(entry.pid)) continue;
    found.push({
      pid: entry.pid,
      sessionId: entry.sessionId,
      name: typeof entry.name === "string" ? entry.name : "",
      status: typeof entry.status === "string" ? entry.status : "",
      cwd: typeof entry.cwd === "string" ? entry.cwd : "",
      entrypoint: typeof entry.entrypoint === "string" ? entry.entrypoint : "",
      startedAt: Number.isFinite(entry.startedAt) ? entry.startedAt : null,
    });
  }
  return found;
}

/** Where each session's transcript lives: sessionId → its project folder. */
async function mapTranscriptFolders(projectsDir, wanted) {
  const found = new Map();
  let folders = [];
  try {
    folders = await readdir(projectsDir);
  } catch {
    return found;
  }
  for (const folder of folders) {
    let files = [];
    try {
      files = await readdir(join(projectsDir, folder));
    } catch {
      continue;
    }
    for (const file of files) {
      const id = file.endsWith(".jsonl") ? file.slice(0, -6) : "";
      if (wanted.has(id)) found.set(id, join(projectsDir, folder));
    }
  }
  return found;
}

/**
 * Every subagent a session has started, most recently active first.
 * @param folder - the session's project folder
 * @param sessionId - the session
 * @param now - the current time (ms)
 * @returns { total, list: [{ id, name, task, model, type, state, startedAt, lastActivity, lastAction }] }
 */
export async function readSubagents(folder, sessionId, now = Date.now()) {
  const dir = join(folder, sessionId, "subagents");
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return { total: 0, list: [] };
  }
  const found = [];
  for (const file of files) {
    const info = await stat(join(dir, file)).catch(() => null);
    if (info) found.push({ file: join(dir, file), id: file.slice(0, -6), mtimeMs: info.mtimeMs });
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const list = await Promise.all(found.slice(0, MAX_SUBAGENTS).map(async (f) => {
    const meta = parseSubagentMeta(await readJson(f.file.replace(/\.jsonl$/, ".meta.json")));
    const head = await readChunk(f.file, false);
    const lastAction = readLastAction(await readChunk(f.file, true));
    return {
      id: f.id,
      ...meta,
      model: meta.model || findModel(head),
      state: pickSubagentState(now - f.mtimeMs, lastAction),
      startedAt: readFirstTimestamp(head),
      lastActivity: new Date(f.mtimeMs).toISOString(),
      lastAction,
    };
  }));
  return { total: found.length, list };
}

/**
 * The open Claude Code sessions on this machine, with their subagents.
 * @param options - claudeDir (defaults to ~/.claude) and now (ms)
 * @returns [{ id, title, project, cwd, state, entrypoint, model, startedAt, lastActivity, memoryMB, subagents, subagentList }]
 */
export async function readOpenSessions({ claudeDir = resolveClaudeDir(), now = Date.now() } = {}) {
  const processes = await readOpenProcesses(join(claudeDir, "sessions"));
  const folders = await mapTranscriptFolders(join(claudeDir, "projects"), new Set(processes.map((p) => p.sessionId)));
  const memory = await readMemory(processes.map((p) => p.pid));
  const sessions = await Promise.all(processes.map(async (proc) => {
    const folder = folders.get(proc.sessionId);
    const transcript = folder ? join(folder, `${proc.sessionId}.jsonl`) : null;
    const info = transcript ? await stat(transcript).catch(() => null) : null;
    const lastMs = info?.mtimeMs ?? proc.startedAt ?? now;
    const subs = folder ? await readSubagents(folder, proc.sessionId, now) : { total: 0, list: [] };
    const project = pickProjectName(proc.cwd);
    return {
      id: proc.sessionId,
      title: proc.name || project || "Untitled session",
      project,
      cwd: proc.cwd,
      state: pickSessionState(proc.status, now - lastMs),
      entrypoint: proc.entrypoint,
      model: transcript ? findModel(await readChunk(transcript, true), true) : "",
      startedAt: proc.startedAt ? new Date(proc.startedAt).toISOString() : null,
      lastActivity: new Date(lastMs).toISOString(),
      memoryMB: memory.get(proc.pid) ?? null,
      subagents: subs.total,
      subagentList: subs.list,
    };
  }));
  return sessions.sort((a, b) => (a.state === b.state ? 0 : a.state === "working" ? -1 : 1) || a.title.localeCompare(b.title));
}
