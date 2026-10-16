#!/usr/bin/env node
// Starts Subagent City: `subagent-city [--port 4777]`, then open the address it prints.
import { createSessionServer } from "./server.js";

function readPort(argv: string[]): number {
  const index = argv.indexOf("--port");
  const value = index >= 0 ? argv[index + 1] : process.env["SUBAGENT_CITY_PORT"];
  const port = Number(value ?? 4777);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Not a valid port: ${String(value)}`);
    process.exit(1);
  }
  return port;
}

const port = readPort(process.argv.slice(2));
const server = createSessionServer({ port });
server.on("error", (error) => {
  const taken = "code" in error && error.code === "EADDRINUSE";
  console.error(taken ? `Port ${port} is taken. Try --port <another>.` : error.message);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Subagent City on http://localhost:${port}/`);
});
