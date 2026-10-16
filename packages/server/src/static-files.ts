// Serves the web build from one folder, and nothing outside it.
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".map": "application/json",
};

interface StaticFile {
  type: string;
  body: Buffer;
}

function decodePath(urlPath: string): string | null {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return null;
  }
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

/**
 * The file a request path points to, when it is an allowed type inside publicDir.
 * @param publicDir - the folder the web build lives in
 * @param urlPath - the request's pathname; "/" means index.html
 * @returns the file's content type and bytes, or null when the path must answer 404
 */
export async function readStaticFile(publicDir: string, urlPath: string): Promise<StaticFile | null> {
  const decoded = decodePath(urlPath === "/" ? "/index.html" : urlPath);
  if (decoded === null || decoded.includes("\0") || decoded.includes("\\")) return null;
  const type = CONTENT_TYPES[extname(decoded).toLowerCase()];
  if (!type) return null;
  const root = resolve(publicDir);
  const target = resolve(join(root, decoded));
  if (!isInside(root, target)) return null;
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!isInside(realRoot, realTarget)) return null;
    return { type, body: await readFile(realTarget) };
  } catch {
    return null;
  }
}
