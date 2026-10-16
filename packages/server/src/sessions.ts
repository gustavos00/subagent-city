// Reads which Claude Code sessions are open on this machine, and the subagents each one has started.
//
// Sources (all local, read-only):
//   ~/.claude/sessions/<pid>.json                          one file per running Claude Code process
//   ~/.claude/projects/<folder>/<sessionId>.jsonl          the session's transcript (only its head and tail are read)
//   ~/.claude/projects/<folder>/<sessionId>/subagents/     one transcript (+ .meta.json) per subagent
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { LastAction, Session, SessionState, Subagent, SubagentState } from "@subagent-city/shared";
import {
  isRecord,
  mapTranscriptFolders,
  readChunk,
  readJson,
  readMemory,
  readOpenProcesses,
  resolveClaudeDir,
} from "./claude-files.js";

const WORKING_MS = 90 * 1000;
const RECENT_MS = 60 * 60 * 1000;
const MAX_SUBAGENTS = 40;
const MAX_NAME = 24;

interface SubagentMeta {
  name: string;
  task: string;
  model: string;
  type: string;
}

interface SubagentList {
  total: number;
  list: Subagent[];
}

/** The last part of a path, with / or \ as separators (a Windows path read on any system). */
function readLastSegment(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/**
 * The project a session works on, from its working directory. A worktree counts as the repository it belongs to.
 * @param cwd - the session's working directory
 * @returns the folder name, or "" when there is no cwd
 */
export function pickProjectName(cwd: unknown): string {
  if (typeof cwd !== "string" || !cwd.trim()) return "";
  const path = cwd.replace(/[\\/]+$/, "");
  const worktree =
    /^(.*?)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/.exec(path) ??
    /^(.*?)[\\/]\.claude-worktrees[\\/]([^\\/]+)[\\/][^\\/]+$/.exec(path);
  if (worktree) return worktree[2] ?? readLastSegment(worktree[1] ?? "");
  return readLastSegment(path);
}

/** How busy something is from how long ago its transcript last changed. */
function pickActivity(ageMs: number): "working" | "recent" | "idle" {
  if (ageMs <= WORKING_MS) return "working";
  return ageMs <= RECENT_MS ? "recent" : "idle";
}

/** Whether a subagent's last action was handing its result back to the session that started it. */
function isHandback(lastAction: LastAction | null): boolean {
  return lastAction?.kind === "tool" && /handback/i.test(lastAction.tool);
}

/**
 * A subagent's state: "done" once it has handed its work back (for an hour, then "idle"), otherwise by how recently it wrote.
 * @param ageMs - milliseconds since its transcript last changed
 * @param lastAction - from readLastAction, or null
 */
export function pickSubagentState(ageMs: number, lastAction: LastAction | null): SubagentState {
  if (isHandback(lastAction)) return ageMs <= RECENT_MS ? "done" : "idle";
  return pickActivity(ageMs);
}

/**
 * A session's state from what its process reports, falling back to the transcript's age when the process says nothing.
 * @param status - the process's own status ("busy", "idle", ...), or undefined
 * @param ageMs - milliseconds since the transcript last changed
 */
export function pickSessionState(status: string | undefined, ageMs: number): SessionState {
  if (status === "busy") return "working";
  if (status) return "idle";
  return ageMs <= WORKING_MS ? "working" : "idle";
}

/**
 * The name, task and model of one subagent from its meta file. A description reads "Name: task"; without a colon the
 * first word is a name only when it is capitalised.
 * @param meta - the parsed .meta.json, or null
 */
export function parseSubagentMeta(meta: unknown): SubagentMeta {
  const fields = isRecord(meta) ? meta : {};
  const { description: rawDescription, model: rawModel, agentType } = fields;
  const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
  const model = typeof rawModel === "string" ? rawModel : "";
  const type = typeof agentType === "string" ? agentType : "";
  const colon = description.indexOf(":");
  if (colon > 0) {
    const name = description.slice(0, colon).trim();
    if (name) return { name: name.slice(0, MAX_NAME), task: description.slice(colon + 1).trim(), model, type };
  }
  const first = description.split(/\s+/)[0] ?? "";
  if (/^\p{Lu}[\p{L}'-]*$/u.test(first) && first.length <= MAX_NAME) {
    return { name: first, task: description.slice(first.length).trim(), model, type };
  }
  return { name: "", task: description, model, type };
}

/**
 * The first or last model named in a chunk of transcript.
 * @param text - some JSONL lines
 * @param last - true for the last one (the model now), false for the first
 * @returns a model id such as "claude-sonnet-4-5", or ""
 */
export function findModel(text: string, last = false): string {
  const all = [...text.matchAll(/"model":"(claude-[^"]+)"/g)];
  const match = last ? all.at(-1) : all[0];
  return match?.[1] ?? "";
}

/** A short, one-line account of what a tool call does, from its input. */
function describeToolInput(input: unknown): string {
  if (!isRecord(input)) return "";
  const value =
    input["description"] ??
    input["command"] ??
    input["file_path"] ??
    input["path"] ??
    input["pattern"] ??
    input["url"] ??
    input["query"] ??
    input["prompt"];
  const text = typeof value === "string" ? value : "";
  const short = /^(\/|[A-Za-z]:\\)/.test(text) && !/\s/.test(text) ? readLastSegment(text) : text;
  return short.replace(/\s+/g, " ").trim().slice(0, 90);
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}

/**
 * What a subagent did last, from the tail of its transcript: its last tool call, or else its last words.
 * @param text - the last JSONL lines of the transcript
 * @returns the last action, or null when the tail holds none
 */
export function readLastAction(text: string): LastAction | null {
  for (const line of text.split("\n").reverse()) {
    if (!line.includes('"type":"assistant"')) continue;
    const entry = parseJsonLine(line);
    if (!isRecord(entry)) continue;
    const { message, timestamp } = entry;
    const rawContent = isRecord(message) ? message["content"] : null;
    const blocks = Array.isArray(rawContent) ? (rawContent as unknown[]).filter(isRecord) : [];
    const at = typeof timestamp === "string" ? timestamp : null;
    const tool = blocks.findLast((block) => block["type"] === "tool_use");
    if (tool) {
      const name = tool["name"];
      return { kind: "tool", tool: typeof name === "string" ? name : "", detail: describeToolInput(tool["input"]), at };
    }
    const words = blocks
      .filter((block) => block["type"] === "text")
      .map((block) => (typeof block["text"] === "string" ? block["text"] : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (words) return { kind: "text", tool: "", detail: words.slice(0, 140), at };
  }
  return null;
}

/** When a transcript starts: the first timestamp in its head, as an ISO string, or null. */
function readFirstTimestamp(text: string): string | null {
  return /"timestamp":"([^"]+)"/.exec(text)?.[1] ?? null;
}

/**
 * Every subagent a session has started, most recently active first.
 * @param folder - the session's project folder
 * @param sessionId - the session
 * @param now - the current time (ms)
 */
async function readSubagents(folder: string, sessionId: string, now: number): Promise<SubagentList> {
  const dir = join(folder, sessionId, "subagents");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return { total: 0, list: [] };
  }
  const found: { file: string; id: string; mtimeMs: number }[] = [];
  for (const file of files) {
    const info = await stat(join(dir, file)).catch(() => null);
    if (info) found.push({ file: join(dir, file), id: file.slice(0, -6), mtimeMs: info.mtimeMs });
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const list = await Promise.all(
    found.slice(0, MAX_SUBAGENTS).map(async (f): Promise<Subagent> => {
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
    }),
  );
  return { total: found.length, list };
}

/**
 * The open Claude Code sessions on this machine, with their subagents.
 * @param options - claudeDir (defaults to ~/.claude) and now (ms)
 */
export async function readOpenSessions({
  claudeDir = resolveClaudeDir(),
  now = Date.now(),
}: { claudeDir?: string; now?: number } = {}): Promise<Session[]> {
  const processes = await readOpenProcesses(join(claudeDir, "sessions"));
  const folders = await mapTranscriptFolders(join(claudeDir, "projects"), new Set(processes.map((p) => p.sessionId)));
  const memory = await readMemory(processes.map((p) => p.pid));
  const sessions = await Promise.all(
    processes.map(async (proc): Promise<Session> => {
      const folder = folders.get(proc.sessionId);
      const transcript = folder ? join(folder, `${proc.sessionId}.jsonl`) : null;
      const info = transcript ? await stat(transcript).catch(() => null) : null;
      const lastMs = info?.mtimeMs ?? proc.startedAt ?? now;
      const subs: SubagentList = folder ? await readSubagents(folder, proc.sessionId, now) : { total: 0, list: [] };
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
    }),
  );
  return sessions.sort(
    (a, b) => (a.state === b.state ? 0 : a.state === "working" ? -1 : 1) || a.title.localeCompare(b.title),
  );
}
