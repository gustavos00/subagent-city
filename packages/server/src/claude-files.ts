// Low-level, read-only access to the files Claude Code keeps in ~/.claude.
// These files are Claude Code's own, not a public API: every read fails soft and every field is checked.
import { execFile } from "node:child_process";
import { open, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 256 * 1024;

export interface OpenProcess {
  pid: number;
  sessionId: string;
  name: string;
  status: string;
  cwd: string;
  entrypoint: string;
  startedAt: number | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveClaudeDir(): string {
  return process.env["SUBAGENT_CITY_CLAUDE_DIR"] ?? join(homedir(), ".claude");
}

/**
 * The start or the end of a file as text; transcripts can be huge, so only a bounded chunk is ever read.
 * @param file - the file to read
 * @param fromEnd - true for the tail, false for the head
 * @returns the chunk, or "" when the file cannot be read
 */
export async function readChunk(file: string, fromEnd: boolean): Promise<string> {
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

/**
 * The resident memory of some processes.
 * @param pids - the processes to look at
 * @returns pid to megabytes; empty on Windows or when `ps` fails
 */
export function readMemory(pids: number[]): Promise<Map<number, number>> {
  if (!pids.length || process.platform === "win32") return Promise.resolve(new Map<number, number>());
  return new Promise((resolve) => {
    execFile("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], { timeout: 4000 }, (_error, stdout) => {
      const rss = new Map<number, number>();
      for (const line of stdout.split("\n")) {
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
    const entry = await readJson(join(dir, file));
    if (!isRecord(entry)) continue;
    const { pid, sessionId } = entry;
    if (typeof pid !== "number" || !Number.isInteger(pid)) continue;
    if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId) || !isAlive(pid)) continue;
    const { name, status, cwd, entrypoint, startedAt } = entry;
    found.push({
      pid,
      sessionId,
      name: typeof name === "string" ? name : "",
      status: typeof status === "string" ? status : "",
      cwd: typeof cwd === "string" ? cwd : "",
      entrypoint: typeof entrypoint === "string" ? entrypoint : "",
      startedAt: typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : null,
    });
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
