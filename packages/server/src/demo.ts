// `npm run demo`: Subagent City on made-up sessions, for trying it out or taking screenshots without showing your own work.
// It builds a fake ~/.claude in a temporary folder, keeps a few `sleep` processes alive as the "open sessions",
// touches the working subagents' transcripts so they stay busy, and cleans everything up on Ctrl+C.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionServer } from "./server.js";
import { readOpenSessions } from "./sessions.js";

type DemoAction = { handback: true } | { words: string } | { tool: [name: string, input: Record<string, string>] };

type DemoSubagent = { name: string; task: string; model: string; ago: number } & DemoAction;

interface DemoSession {
  title: string;
  cwd: string;
  status: "busy" | "idle";
  model: string;
  subagents: DemoSubagent[];
}

const MIN = 60_000;
const SESSIONS: DemoSession[] = [
  {
    title: "Checkout redesign",
    cwd: "/home/sam/code/storefront",
    status: "busy",
    model: "claude-opus-4-5",
    subagents: [
      {
        name: "Maya",
        task: "build the new cart drawer",
        model: "sonnet",
        ago: 0,
        tool: ["Edit", { file_path: "/home/sam/code/storefront/src/cart/Drawer.tsx" }],
      },
      {
        name: "Leo",
        task: "write e2e tests for checkout",
        model: "sonnet",
        ago: 0,
        tool: ["Bash", { command: "npx playwright test checkout.spec.ts" }],
      },
      {
        name: "Iris",
        task: "review accessibility of the payment form",
        model: "opus",
        ago: 0,
        tool: ["Read", { file_path: "/home/sam/code/storefront/src/checkout/PaymentForm.tsx" }],
      },
      {
        name: "Noah",
        task: "audit bundle size",
        model: "haiku",
        ago: 6,
        tool: ["Bash", { command: "npm run build -- --analyze" }],
      },
      { name: "Zoe", task: "map the current checkout flow", model: "sonnet", ago: 14, handback: true },
      { name: "Kai", task: "collect analytics events", model: "haiku", ago: 180, handback: true },
      { name: "Ruth", task: "draft the migration plan", model: "opus", ago: 240, handback: true },
    ],
  },
  {
    title: "Payments API: refunds",
    cwd: "/home/sam/code/payments-api/.claude/worktrees/brave-otter-41",
    status: "busy",
    model: "claude-opus-4-5",
    subagents: [
      {
        name: "Omar",
        task: "add the refunds endpoint",
        model: "sonnet",
        ago: 0,
        tool: ["Write", { file_path: "/home/sam/code/payments-api/src/refunds/handler.ts" }],
      },
      {
        name: "Lena",
        task: "idempotency keys for refunds",
        model: "sonnet",
        ago: 0,
        tool: ["Bash", { command: "go test ./refunds/..." }],
      },
      {
        name: "Hugo",
        task: "threat-model the refund flow",
        model: "opus",
        ago: 3,
        words:
          "Two risks worth fixing before merge: replayed refund requests and partial refunds above the original charge.",
      },
    ],
  },
  {
    title: "Docs: getting started guide",
    cwd: "/home/sam/code/docs-site",
    status: "idle",
    model: "claude-sonnet-4-5",
    subagents: [
      { name: "Ava", task: "rewrite the install page", model: "sonnet", ago: 22, handback: true },
      { name: "Eli", task: "check every code sample runs", model: "haiku", ago: 35, handback: true },
    ],
  },
  {
    title: "Fix flaky CI on main",
    cwd: "/home/sam/code/storefront",
    status: "idle",
    model: "claude-sonnet-4-5",
    subagents: [],
  },
  {
    title: "Quick question about regex",
    cwd: "/home/sam/scratch",
    status: "idle",
    model: "claude-haiku-4-5",
    subagents: [],
  },
];

function buildLine(entry: unknown): string {
  return JSON.stringify(entry);
}

function buildToolBlocks(sub: DemoSubagent): unknown[] {
  if ("handback" in sub) return [{ type: "tool_use", name: "SubagentHandback", input: {} }];
  if ("words" in sub) return [{ type: "text", text: sub.words }];
  return [{ type: "tool_use", name: sub.tool[0], input: sub.tool[1] }];
}

function buildSubagentTranscript(sub: DemoSubagent, startedAt: number): string {
  const model = sub.model.startsWith("claude") ? sub.model : `claude-${sub.model}-4-5`;
  return [
    buildLine({
      type: "user",
      timestamp: new Date(startedAt).toISOString(),
      message: { role: "user", content: sub.task },
    }),
    buildLine({
      type: "assistant",
      timestamp: new Date().toISOString(),
      message: { model, content: buildToolBlocks(sub) },
    }),
  ].join("\n");
}

function readPid(child: ChildProcess): number {
  if (child.pid === undefined) throw new Error("Could not start the stand-in process (is `sleep` available?).");
  return child.pid;
}

async function buildFakeClaude(dir: string, pids: number[]): Promise<string[]> {
  const working: string[] = [];
  const now = Date.now();
  await mkdir(join(dir, "sessions"), { recursive: true });
  for (const [index, session] of SESSIONS.entries()) {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const pid = pids[index];
    if (pid === undefined) throw new Error("Every demo session needs a stand-in process.");
    await writeFile(
      join(dir, "sessions", `${pid}.json`),
      buildLine({
        pid,
        sessionId: id,
        name: session.title,
        status: session.status,
        cwd: session.cwd,
        entrypoint: "cli",
        startedAt: now - 50 * MIN,
      }),
    );
    const folder = join(dir, "projects", session.cwd.replace(/[/.]/g, "-"));
    await mkdir(join(folder, id, "subagents"), { recursive: true });
    const transcript = join(folder, `${id}.jsonl`);
    await writeFile(transcript, buildLine({ type: "assistant", message: { model: session.model, content: [] } }));
    if (session.status === "busy") working.push(transcript);
    for (const [n, sub] of session.subagents.entries()) {
      const file = join(folder, id, "subagents", `agent-${index}${n}.jsonl`);
      await writeFile(file, buildSubagentTranscript(sub, now - (sub.ago + 12) * MIN));
      await writeFile(
        file.replace(/\.jsonl$/, ".meta.json"),
        buildLine({ agentType: "general-purpose", description: `${sub.name}: ${sub.task}`, model: sub.model }),
      );
      const when = new Date(now - sub.ago * MIN);
      await utimes(file, when, when);
      if (sub.ago === 0) working.push(file);
    }
  }
  return working;
}

const dir = await mkdtemp(join(tmpdir(), "subagent-city-demo-"));
const children = SESSIONS.map(() => spawn("sleep", ["86400"], { stdio: "ignore" }));
const working = await buildFakeClaude(dir, children.map(readPid));
const keepBusy = setInterval(() => {
  const now = new Date();
  for (const file of working) void utimes(file, now, now).catch(() => undefined);
}, 20_000);

const port = Number(process.env["SUBAGENT_CITY_PORT"] ?? 4778);
const server = createSessionServer({ port, readSessions: () => readOpenSessions({ claudeDir: dir }) });
server.listen(port, "127.0.0.1", () => {
  console.log(`Subagent City demo on http://localhost:${port}/ (made-up data; Ctrl+C to stop)`);
});

async function shutDown(): Promise<never> {
  clearInterval(keepBusy);
  server.close();
  for (const child of children) child.kill();
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutDown();
  });
}
