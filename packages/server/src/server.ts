// A small local web server: the web build and one read-only endpoint with the open sessions.
// It listens on 127.0.0.1 only and answers only requests addressed to localhost, so other sites cannot read it.
import type { AddressInfo } from "node:net";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Session, SessionsResponse } from "@subagent-city/shared";
import { readOpenSessions } from "./sessions.js";
import { readStaticFile } from "./static-files.js";

const DEFAULT_PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const CACHE_MS = 2000;
const TEXT = "text/plain; charset=utf-8";
const JSON_TYPE = "application/json";
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

interface SessionServerOptions {
  readSessions?: () => Promise<Session[]>;
  publicDir?: string;
}

interface Reply {
  status: number;
  type: string;
  body: string | Buffer;
}

interface SessionsCache {
  at: number;
  value: Session[] | null;
  loading: Promise<Session[]> | null;
}

/**
 * Whether a request is addressed to this machine on the port in use (stops DNS rebinding: a foreign page whose name resolves to 127.0.0.1).
 * @param host - the Host header
 * @param port - the port the server listens on
 */
export function isLocalHost(host: string | undefined, port: number): boolean {
  const allowed = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  return host !== undefined && allowed.has(host.toLowerCase());
}

/**
 * Builds the server.
 * @param options - readSessions (to swap the source in tests) and publicDir (the web build)
 * @returns an http.Server, not yet listening
 */
export function createSessionServer({
  readSessions = readOpenSessions,
  publicDir = DEFAULT_PUBLIC_DIR,
}: SessionServerOptions = {}): Server {
  let cache: SessionsCache = { at: 0, value: null, loading: null };
  const loadSessions = (): Promise<Session[]> => {
    if (cache.value && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.value);
    cache.loading ??= readSessions()
      .then((value) => {
        cache = { at: Date.now(), value, loading: null };
        return value;
      })
      .catch((error: unknown) => {
        cache.loading = null;
        throw error;
      });
    return cache.loading;
  };

  const buildReply = async (req: IncomingMessage, port: number): Promise<Reply> => {
    if (!isLocalHost(req.headers.host, port))
      return { status: 403, type: TEXT, body: "Only localhost may use this server." };
    if (req.method !== "GET" && req.method !== "HEAD") return { status: 405, type: TEXT, body: "Read-only." };
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/api/sessions") {
      try {
        const body: SessionsResponse = { sessions: await loadSessions(), generatedAt: new Date().toISOString() };
        return { status: 200, type: JSON_TYPE, body: JSON.stringify(body) };
      } catch {
        return { status: 500, type: JSON_TYPE, body: JSON.stringify({ error: "Could not read the sessions." }) };
      }
    }
    const file = await readStaticFile(publicDir, path);
    return file ? { status: 200, type: file.type, body: file.body } : { status: 404, type: TEXT, body: "Not found." };
  };

  const answer = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const { port } = server.address() as AddressInfo;
    const { status, type, body } = await buildReply(req, port);
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...SECURITY_HEADERS });
    res.end(body);
  };

  const server = createServer((req, res) => {
    answer(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, SECURITY_HEADERS);
      res.end();
    });
  });
  return server;
}
