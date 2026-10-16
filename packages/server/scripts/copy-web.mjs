// Copies the web build (Vite output) into the folder the server serves. Does nothing until packages/web has been built.
import { cp, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "web", "dist");
const target = join(here, "..", "public");

const built = await stat(source).then(
  (info) => info.isDirectory(),
  () => false,
);
if (!built) {
  console.log("packages/web/dist not found: skipping the web copy (build packages/web first).");
} else {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  console.log("Copied packages/web/dist to packages/server/public.");
}
