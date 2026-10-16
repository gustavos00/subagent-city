# Subagent City

A live map of the Claude Code subagents running on your machine: which session started each one, what it is doing right now, and which model it runs on.

- **Every open session**, busiest on top, with the subagents it has started.
- **Each subagent's state**: working, paused, done (handed its result back) or idle.
- **What it is doing now**: its last tool call (`Bash · npm test`, `Edit · cart.ts`) or its last words.
- **The model** of each session and subagent (Opus, Sonnet, Haiku).
- **Which project** each session works in, so parallel work on one repository shows up together.

It updates every few seconds. Nothing leaves your machine.

## Run it

Needs Node.js 18 or later. There are no dependencies to install.

```bash
git clone <this repository>
cd subagent-city
npm start
```

Then open <http://localhost:4777/>. Use `npm start -- --port 5000` (or `SUBAGENT_CITY_PORT=5000`) for another port.

## How it knows what is running

It reads the files Claude Code keeps in `~/.claude`:

| What | Where |
| --- | --- |
| Open sessions (one per running Claude Code process) | `~/.claude/sessions/<pid>.json` |
| A session's transcript, for its model | `~/.claude/projects/<folder>/<session>.jsonl` |
| Its subagents: name, task, model, last action | `~/.claude/projects/<folder>/<session>/subagents/` |

Only the start and the end of each transcript are read. A session counts as open only while its process is alive.

These are Claude Code's own files, not a public API, so a Claude Code update can change them. Every field is read defensively: a missing one leaves a blank, never a crash. Set `SUBAGENT_CITY_CLAUDE_DIR` if your Claude folder lives somewhere else.

**Naming subagents.** A subagent whose description starts with `Name:` (for example `Ana: review the cart`) shows up as Ana, with "review the cart" as its task.

## Privacy and safety

- The server listens on `127.0.0.1` only. It refuses requests addressed to any other host name, which stops other web pages from reading it through DNS rebinding.
- It is read-only: it accepts only GET requests and never changes, stops or starts a session.
- The page shows session titles, folder names, subagent descriptions and the last command each subagent ran. Bear that in mind before you share a screenshot.

## Scope of v1

- Claude Code only.
- One machine: the one the server runs on.
- Read-only.

## Development

```bash
npm test
```

| Path | What it holds |
| --- | --- |
| `src/sessions.mjs` | Reads `~/.claude` |
| `src/server.mjs` | The local HTTP server |
| `public/layout.js` | The map's model and layout, with no DOM, so the tests can run it |
| `public/app.js` | Draws the canvas and the side panel |

## License

MIT. See [LICENSE](LICENSE).
