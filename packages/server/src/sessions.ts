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
  pickString,
  mapTranscriptFolders,
  readHead,
  readJson,
  readTail,
  readOpenProcesses,
  resolveClaudeDir,
} from "./claude-files.js";
import { createMtimeCache } from "./mtime-cache.js";

const WORKING_MS = 90 * 1000;
const RECENT_MS = 60 * 60 * 1000;
const MAX_SUBAGENTS = 40;
const MAX_NAME = 24;
const STATE_RANK: Record<SessionState, number> = { working: 0, idle: 1 };

type OpenProcess = Awaited<ReturnType<typeof readOpenProcesses>>[number];

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
  const description = pickString(rawDescription).trim();
  const model = pickString(rawModel);
  const type = pickString(agentType);
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

function findModels(text: string): string[] {
  return [...text.matchAll(/"model":"(claude-[^"]+)"/g)].map((match) => match[1] ?? "");
}

/** The first model named in a chunk of transcript, such as "claude-sonnet-4-5", or "". */
export function findFirstModel(text: string): string {
  return findModels(text)[0] ?? "";
}

/** The last model named in a chunk of transcript (the model now), or "". */
export function findLastModel(text: string): string {
  return findModels(text).at(-1) ?? "";
}

const TOOL_INPUT_KEYS = ["description", "command", "file_path", "path", "pattern", "url", "query", "prompt"];

/** A short, one-line account of what a tool call does, from its input. */
function describeToolInput(input: unknown): string {
  if (!isRecord(input)) return "";
  const text = pickString(TOOL_INPUT_KEYS.map((key) => input[key]).find((value) => typeof value === "string"));
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
      return { kind: "tool", tool: pickString(name), detail: describeToolInput(tool["input"]), at };
    }
    const words = blocks
      .filter((block) => block["type"] === "text")
      .map((block) => pickString(block["text"]))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (words) return { kind: "text", detail: words.slice(0, 140), at };
  }
  return null;
}

/** When a transcript starts: the first timestamp in its head, as an ISO string, or null. */
function readFirstTimestamp(text: string): string | null {
  return /"timestamp":"([^"]+)"/.exec(text)?.[1] ?? null;
}

interface ParsedSubagent {
  meta: SubagentMeta;
  model: string;
  startedAt: string | null;
  lastAction: LastAction | null;
}

const subagentCache = createMtimeCache<ParsedSubagent>();
const sessionModelCache = createMtimeCache<string>();

async function parseSubagentFiles(file: string): Promise<ParsedSubagent> {
  const meta = parseSubagentMeta(await readJson(file.replace(/\.jsonl$/, ".meta.json")));
  const head = await readHead(file);
  return {
    meta,
    model: meta.model || findFirstModel(head),
    startedAt: readFirstTimestamp(head),
    lastAction: readLastAction(await readTail(file)),
  };
}

/**
 * Every subagent a session has started, most recently active first. A transcript is only read again when it changes.
 * @param folder - the session's project folder
 * @param sessionId - the session
 * @param now - the current time (ms)
 */
async function readSubagents(folder: string | undefined, sessionId: string, now: number): Promise<SubagentList> {
  if (!folder) return { total: 0, list: [] };
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
      const { meta, model, startedAt, lastAction } = await subagentCache.load(f.file, f.mtimeMs, () =>
        parseSubagentFiles(f.file),
      );
      return {
        id: f.id,
        name: meta.name,
        task: meta.task,
        type: meta.type,
        model,
        state: pickSubagentState(now - f.mtimeMs, lastAction),
        startedAt,
        lastActivity: new Date(f.mtimeMs).toISOString(),
        lastAction,
      };
    }),
  );
  return { total: found.length, list };
}

async function readTranscript(
  folder: string | undefined,
  sessionId: string,
): Promise<{ mtimeMs: number; model: string } | null> {
  if (!folder) return null;
  const transcript = join(folder, `${sessionId}.jsonl`);
  const info = await stat(transcript).catch(() => null);
  if (!info) return null;
  const model = await sessionModelCache.load(transcript, info.mtimeMs, async () =>
    findLastModel(await readTail(transcript)),
  );
  return { mtimeMs: info.mtimeMs, model };
}

async function buildSession(proc: OpenProcess, folder: string | undefined, now: number): Promise<Session> {
  const transcript = await readTranscript(folder, proc.sessionId);
  const lastMs = transcript?.mtimeMs ?? proc.startedAt ?? now;
  const subs = await readSubagents(folder, proc.sessionId, now);
  const project = pickProjectName(proc.cwd);
  return {
    id: proc.sessionId,
    title: proc.name || project || "Untitled session",
    project,
    state: pickSessionState(proc.status, now - lastMs),
    model: transcript?.model ?? "",
    startedAt: proc.startedAt ? new Date(proc.startedAt).toISOString() : null,
    lastActivity: new Date(lastMs).toISOString(),
    subagentCount: subs.total,
    subagents: subs.list,
  };
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
  const sessions = await Promise.all(processes.map((proc) => buildSession(proc, folders.get(proc.sessionId), now)));
  subagentCache.finishPoll();
  sessionModelCache.finishPoll();
  return sessions.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.title.localeCompare(b.title));
}
