import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { readFileSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root at config time so process.env is populated before tests collect
const rootEnvPath = resolve(__dirname, "../.env");
const envVars: Record<string, string> = {};
if (existsSync(rootEnvPath)) {
  const lines = readFileSync(rootEnvPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    envVars[key] = val;
    if (!process.env[key]) process.env[key] = val;
  }
}

export default defineConfig({
  test: {
    env: envVars,
  },
});
