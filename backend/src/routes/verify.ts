import type { FastifyInstance } from "fastify";
import { ChainService } from "../services/chain.service.js";
import type { Address } from "viem";

export async function verifyRoutes(app: FastifyInstance) {
  app.get("/verify/:badgeId", async (request, reply) => {
    const rpcUrl = process.env.RPC_URL;
    const badgeAddress = process.env.BADGE_ADDRESS as Address | undefined;
    const registryAddress = process.env.REGISTRY_ADDRESS as Address | undefined;

    if (!rpcUrl || !badgeAddress || !registryAddress) {
      return reply
        .status(500)
        .send({ error: "Chain config not set (RPC_URL, BADGE_ADDRESS, REGISTRY_ADDRESS)" });
    }

    const { badgeId } = request.params as { badgeId: string };
    const tokenId = BigInt(badgeId);

    const chain = new ChainService({
      rpcUrl,
      badgeAddress,
      registryAddress,
    });

    try {
      const [valid, badge] = await Promise.all([
        chain.isValid(tokenId),
        chain.getBadge(tokenId),
      ]);

      const claimLabels = ["VACCINATED", "TEST_NEGATIVE", "MEDICALLY_FIT"];

      return {
        tokenId: badgeId,
        valid,
        claimType: badge.claimType,
        claimLabel: claimLabels[badge.claimType] ?? "UNKNOWN",
        expiresAt: Number(badge.expiresAt),
        subjectHash: badge.subjectHash,
        issuerPubkeyHash: badge.issuerPubkeyHash,
      };
    } catch (e: any) {
      return reply.status(404).send({ error: "Badge not found", details: e.message });
    }
  });
}
