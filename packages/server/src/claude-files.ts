// Low-level, read-only access to the files Claude Code keeps in ~/.claude.
// These files are Claude Code's own, not a public API: every read fails soft and every field is checked.
import { open, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEAD_BYTES = 16 * 1024;
const TAIL_BYTES = 256 * 1024;

interface OpenProcess {
  pid: number;
  sessionId: string;
  name: string;
  status: string;
  cwd: string;
  startedAt: number | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveClaudeDir(): string {
  return process.env["SUBAGENT_CITY_CLAUDE_DIR"] ?? join(homedir(), ".claude");
}

async function readBytes(file: string, maxBytes: number, pickOffset: (size: number, length: number) => number) {
  let handle;
  try {
    handle = await open(file, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, pickOffset(size, length));
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close();
  }
}

/** The start of a file as text (transcripts can be huge, so only a bounded chunk is read); "" when unreadable. */
export function readHead(file: string): Promise<string> {
  return readBytes(file, HEAD_BYTES, () => 0);
}

/** The end of a file as text, which may begin mid-line; "" when unreadable. */
export function readTail(file: string): Promise<string> {
  return readBytes(file, TAIL_BYTES, (size, length) => size - length);
}

export async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

export function pickString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseOpenProcess(entry: unknown): OpenProcess | null {
  if (!isRecord(entry)) return null;
  const { pid, sessionId, startedAt } = entry;
  if (typeof pid !== "number" || !Number.isInteger(pid)) return null;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return null;
  return {
    pid,
    sessionId,
    name: pickString(entry["name"]),
    status: pickString(entry["status"]),
    cwd: pickString(entry["cwd"]),
    startedAt: typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : null,
  };
}

/**
 * The Claude Code processes running now, one per open session.
 * @param dir - the folder with the <pid>.json files
 */
export async function readOpenProcesses(dir: string): Promise<OpenProcess[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f));
  } catch {
    return [];
  }
  const found: OpenProcess[] = [];
  for (const file of files) {
    const proc = parseOpenProcess(await readJson(join(dir, file)));
    if (proc && isAlive(proc.pid)) found.push(proc);
  }
  return found;
}

/**
 * Where each session's transcript lives.
 * @param projectsDir - ~/.claude/projects
 * @param wanted - the session ids to look for
 * @returns sessionId to its project folder
 */
export async function mapTranscriptFolders(
  projectsDir: string,
  wanted: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  let folders: string[];
  try {
    folders = await readdir(projectsDir);
  } catch {
    return found;
  }
  for (const folder of folders) {
    let files: string[];
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
