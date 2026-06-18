import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Load `src/.env` or package-root `.env` when running the CLI (Node 20.12+). */
export function loadPackageEnv(): void {
  if (typeof process.loadEnvFile !== "function") {
    return;
  }

  const srcDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(srcDir, ".env"), join(srcDir, "..", ".env")];

  for (const path of candidates) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}
