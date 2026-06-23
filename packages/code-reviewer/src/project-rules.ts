import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GIT_REF_PATTERN = /^[\w./-]+$/;

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

function loadProjectRulesFromGitRef(ref: string): string | undefined {
  if (!GIT_REF_PATTERN.test(ref)) {
    return undefined;
  }

  try {
    return execFileSync("git", ["show", `${ref}:AGENTS.md`], { encoding: "utf8" });
  } catch {
    return undefined;
  }
}

export function loadProjectRules(): string {
  const gitRef = process.env.PROJECT_RULES_GIT_REF?.trim();
  if (gitRef) {
    const fromRef = loadProjectRulesFromGitRef(gitRef);
    if (fromRef !== undefined) {
      return fromRef;
    }
  }

  const agentsPath = resolveAgentsMdPath();
  if (!agentsPath) {
    return "";
  }

  return readFileSync(agentsPath, "utf8");
}
