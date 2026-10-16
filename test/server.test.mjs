import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createSessionServer, isLocalHost } from "../src/server.mjs";

function send(port, { path = "/", method = "GET", host = `localhost:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { host } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function startServer(readSessions) {
  const server = createSessionServer({ port: 0, readSessions });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  server.close();
  const real = createSessionServer({ port, readSessions });
  await new Promise((resolve) => real.listen(port, "127.0.0.1", resolve));
  return { server: real, port };
}

test("only requests addressed to localhost are allowed", () => {
  assert.ok(isLocalHost("localhost:4777", 4777));
  assert.ok(isLocalHost("127.0.0.1:4777", 4777));
  assert.ok(!isLocalHost("evil.example:4777", 4777));
  assert.ok(!isLocalHost("localhost:80", 4777));
  assert.ok(!isLocalHost(undefined, 4777));
});

test("the server serves the page and the sessions, refuses foreign hosts and anything but reads", async () => {
  const { server, port } = await startServer(async () => [{ id: "s", title: "One", subagentList: [] }]);
  try {
    const api = await send(port, { path: "/api/sessions" });
    assert.equal(api.status, 200);
    assert.equal(JSON.parse(api.body).sessions[0].title, "One");
    assert.match(api.headers["content-security-policy"], /default-src 'self'/);
    const page = await send(port);
    assert.equal(page.status, 200);
    assert.match(page.body, /Subagent City/);
    assert.equal((await send(port, { path: "/layout.js" })).headers["content-type"], "text/javascript; charset=utf-8");
    assert.equal((await send(port, { host: "evil.example" })).status, 403);
    assert.equal((await send(port, { method: "POST", path: "/api/sessions" })).status, 405);
    assert.equal((await send(port, { path: "/../src/server.mjs" })).status, 404);
    assert.equal((await send(port, { path: "/%2e%2e/package.json" })).status, 404);
  } finally {
    server.close();
  }
});

test("a failing read answers 500 instead of crashing", async () => {
  const { server, port } = await startServer(async () => {
    throw new Error("boom");
  });
  try {
    assert.equal((await send(port, { path: "/api/sessions" })).status, 500);
  } finally {
    server.close();
  }
});
