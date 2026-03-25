import type { FastifyInstance } from "fastify";
import { ChainService, BadgeState } from "../services/chain.service.js";

export async function verifyRoutes(app: FastifyInstance) {
  app.get("/verify/:badgeId", async (request, reply) => {
    const nodeUrl = process.env.MIDNIGHT_NODE_URL ?? "http://127.0.0.1:9944";
    const indexerUrl = process.env.MIDNIGHT_INDEXER_URL ?? "http://127.0.0.1:8088/api/v3/graphql";
    const indexerWsUrl = process.env.MIDNIGHT_INDEXER_WS_URL ?? "ws://127.0.0.1:8088/api/v3/graphql/ws";
    const proofServerUrl = process.env.MIDNIGHT_PROOF_SERVER_URL ?? "http://127.0.0.1:6300";

    const { badgeId } = request.params as { badgeId: string };

    const chain = new ChainService({
      nodeUrl,
      indexerUrl,
      indexerWsUrl,
      proofServerUrl,
      networkId: process.env.MIDNIGHT_NETWORK_ID ?? "undeployed",
    });

    try {
      const badge = await chain.getLatestBadge();
      const valid = await chain.isValid();

      const claimLabels = ["VACCINATED", "TEST_NEGATIVE", "MEDICALLY_FIT"];

      return {
        badgeId,
        valid,
        claimType: badge.claimType,
        claimLabel: claimLabels[badge.claimType] ?? "UNKNOWN",
        expiresAt: Number(badge.expiresAt),
        subjectHash: toHex(badge.subjectHash),
        issuerHash: toHex(badge.issuerHash),
        state: BadgeState[badge.state],
      };
    } catch (e: any) {
      return reply.status(404).send({ error: "Badge not found", details: e.message });
    }
  });
}

function toHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
