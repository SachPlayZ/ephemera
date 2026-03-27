import Fastify from "fastify";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { claimRoutes } from "./routes/claim.js";
import { proofRoutes } from "./routes/proof.js";
import { verifyRoutes } from "./routes/verify.js";

function loadRootEnv(): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const envPath = resolve(__dirname, "../../.env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

const app = Fastify({ logger: true });

app.register(claimRoutes, { prefix: "/" });
app.register(proofRoutes, { prefix: "/" });
app.register(verifyRoutes, { prefix: "/" });

app.get("/health", async () => ({ status: "ok" }));

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

app.listen({ port: PORT, host: HOST }).then((address) => {
  console.log(`E-PoH backend listening at ${address}`);
});

export { app };
