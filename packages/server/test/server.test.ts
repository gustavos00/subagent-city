import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session, SessionsResponse } from "@subagent-city/shared";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createSessionServer, isLocalHost } from "../src/server.js";
import { readStaticFile } from "../src/static-files.js";

interface Reply {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

interface RequestOptions {
  path?: string;
  method?: string;
  host?: string;
}

const ONE_SESSION: Session = {
  id: "s",
  title: "One",
  project: "",
  cwd: "",
  state: "idle",
  entrypoint: "",
  model: "",
  startedAt: null,
  lastActivity: "2026-01-01T10:00:00.000Z",
  memoryMB: null,
  subagents: 0,
  subagentList: [],
};

let publicDir = "";

beforeAll(async () => {
  publicDir = await mkdtemp(join(tmpdir(), "subagent-city-public-"));
  await mkdir(join(publicDir, "assets"));
  await writeFile(join(publicDir, "index.html"), "<title>Subagent City</title>");
  await writeFile(join(publicDir, "layout.js"), "export {};");
  await writeFile(join(publicDir, "assets", "index-1a2b3c.css"), "body{}");
  await writeFile(join(publicDir, "secret.txt"), "not served");
  await writeFile(join(publicDir, "..", `${publicDir.split("/").pop() ?? "x"}-outside.json`), "{}");
});

afterAll(async () => {
  await rm(publicDir, { recursive: true, force: true });
  await rm(`${publicDir}-outside.json`, { force: true });
});

function sendRequest(port: number, { path = "/", method = "GET", host = `localhost:${port}` }: RequestOptions = {}) {
  return new Promise<Reply>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { host } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function startServer(readSessions: () => Promise<Session[]>): Promise<{ server: Server; port: number }> {
  const probe = createSessionServer({ port: 0, readSessions, publicDir });
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  probe.close();
  const server = createSessionServer({ port, readSessions, publicDir });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, port };
}

test("only requests addressed to localhost are allowed", () => {
  expect(isLocalHost("localhost:4777", 4777)).toBe(true);
  expect(isLocalHost("127.0.0.1:4777", 4777)).toBe(true);
  expect(isLocalHost("evil.example:4777", 4777)).toBe(false);
  expect(isLocalHost("localhost:80", 4777)).toBe(false);
  expect(isLocalHost(undefined, 4777)).toBe(false);
});

test("the server serves the page and the sessions, refuses foreign hosts and anything but reads", async () => {
  const { server, port } = await startServer(() => Promise.resolve([ONE_SESSION]));
  try {
    const api = await sendRequest(port, { path: "/api/sessions" });
    expect(api.status).toBe(200);
    expect((JSON.parse(api.body) as SessionsResponse).sessions[0]?.title).toBe("One");
    expect(api.headers["content-security-policy"]).toMatch(/default-src 'self'/);
    const page = await sendRequest(port);
    expect(page.status).toBe(200);
    expect(page.body).toMatch(/Subagent City/);
    expect((await sendRequest(port, { path: "/layout.js" })).headers["content-type"]).toBe(
      "text/javascript; charset=utf-8",
    );
    expect((await sendRequest(port, { path: "/assets/index-1a2b3c.css" })).headers["content-type"]).toBe(
      "text/css; charset=utf-8",
    );
    expect((await sendRequest(port, { host: "evil.example" })).status).toBe(403);
    expect((await sendRequest(port, { method: "POST", path: "/api/sessions" })).status).toBe(405);
    expect((await sendRequest(port, { path: "/../src/server.mjs" })).status).toBe(404);
    expect((await sendRequest(port, { path: "/%2e%2e/package.json" })).status).toBe(404);
    expect((await sendRequest(port, { path: "/secret.txt" })).status).toBe(404);
    expect((await sendRequest(port, { path: "/missing.js" })).status).toBe(404);
  } finally {
    server.close();
  }
});

test("static files outside the folder, or of a type that is not allowed, are never served", async () => {
  const outside = `/${publicDir.split("/").pop() ?? "x"}-outside.json`;
  expect(await readStaticFile(publicDir, "/layout.js")).not.toBeNull();
  expect(await readStaticFile(publicDir, `/..${outside}`)).toBeNull();
  expect(await readStaticFile(publicDir, `/%2e%2e${outside}`)).toBeNull();
  expect(await readStaticFile(publicDir, `/..%2f..${outside}`)).toBeNull();
  expect(await readStaticFile(publicDir, "/assets/%00.css")).toBeNull();
  expect(await readStaticFile(publicDir, "/assets\\..\\index.html")).toBeNull();
  expect(await readStaticFile(publicDir, "/%E0%A4%A.js")).toBeNull();
  expect(await readStaticFile(publicDir, "/assets")).toBeNull();
  expect(await readStaticFile(publicDir, "/secret.txt")).toBeNull();
});

test("a failing read answers 500 instead of crashing", async () => {
  const { server, port } = await startServer(() => Promise.reject(new Error("boom")));
  try {
    expect((await sendRequest(port, { path: "/api/sessions" })).status).toBe(500);
  } finally {
    server.close();
  }
});
