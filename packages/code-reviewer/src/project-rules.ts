import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveAgentsMdPath(): string | undefined {
  const candidates = [
    process.env.MEALDRAFT_ROOT,
    process.env.PROJECT_ROOT,
    process.cwd(),
    resolve(packageRoot, "../.."),
  ]
    .filter((value): value is string => Boolean(value))
    .map((root) => resolve(root, "AGENTS.md"));

  return candidates.find((path) => existsSync(path));
}

export function loadProjectRules(): string {
  const agentsPath = resolveAgentsMdPath();
  if (!agentsPath) {
    return "";
  }

  return readFileSync(agentsPath, "utf8");
}
