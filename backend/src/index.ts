import Fastify from "fastify";
import { claimRoutes } from "./routes/claim.js";
import { proofRoutes } from "./routes/proof.js";
import { verifyRoutes } from "./routes/verify.js";

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
