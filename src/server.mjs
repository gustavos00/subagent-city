// A small local web server: the page in public/ and one read-only endpoint with the open sessions.
// It listens on 127.0.0.1 only and answers only requests addressed to localhost, so other sites cannot read it.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readOpenSessions } from "./sessions.mjs";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const CACHE_MS = 2000;
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

/**
 * Whether a request is addressed to this machine (stops DNS rebinding: a foreign page whose name resolves to 127.0.0.1).
 * @param host - the Host header
 * @param port - the port the server listens on
 */
export function isLocalHost(host, port) {
  const allowed = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  return typeof host === "string" && allowed.has(host.toLowerCase());
}

/**
 * Builds the server.
 * @param options - port (for the Host check) and readSessions (to swap the source in tests)
 * @returns an http.Server, not yet listening
 */
export function createSessionServer({ port, readSessions = readOpenSessions } = {}) {
  let cache = { at: 0, value: null, loading: null };
  const loadSessions = () => {
    if (cache.value && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.value);
    cache.loading ??= readSessions()
      .then((value) => {
        cache = { at: Date.now(), value, loading: null };
        return value;
      })
      .catch((error) => {
        cache.loading = null;
        throw error;
      });
    return cache.loading;
  };

  return createServer(async (req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...SECURITY_HEADERS });
      res.end(body);
    };
    if (!isLocalHost(req.headers.host, port)) return send(403, "text/plain; charset=utf-8", "Only localhost may use this server.");
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain; charset=utf-8", "Read-only.");
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/api/sessions") {
      try {
        const sessions = await loadSessions();
        return send(200, "application/json", JSON.stringify({ sessions, generatedAt: new Date().toISOString() }));
      } catch {
        return send(500, "application/json", JSON.stringify({ error: "Could not read the sessions." }));
      }
    }
    const file = path === "/" ? "/index.html" : path;
    const match = /^\/([a-z0-9-]+)(\.html|\.css|\.js|\.svg)$/.exec(file);
    if (!match) return send(404, "text/plain; charset=utf-8", "Not found.");
    try {
      return send(200, TYPES[match[2]], await readFile(join(publicDir, match[1] + match[2])));
    } catch {
      return send(404, "text/plain; charset=utf-8", "Not found.");
    }
  });
}
