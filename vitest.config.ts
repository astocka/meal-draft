import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTestEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, ".env.test");
  if (!existsSync(envPath)) {
    return {};
  }
  const parsed = parse(readFileSync(envPath));
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value.trim() !== ""));
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    env: loadTestEnv(),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
