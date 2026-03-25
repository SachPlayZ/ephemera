import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProofService } from "../services/proof.service.js";
import { claimStore } from "./claim.js";

const GenerateProofSchema = z.object({
  claimId: z.string().min(1),
});

let proofService: ProofService | null = null;

async function getProofService(): Promise<ProofService> {
  if (!proofService) {
    proofService = new ProofService();
    await proofService.init();
  }
  return proofService;
}

export async function proofRoutes(app: FastifyInstance) {
  app.post("/generate-proof", async (request, reply) => {
    const parsed = GenerateProofSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const signedClaim = claimStore.get(parsed.data.claimId);
    if (!signedClaim) {
      return reply.status(404).send({ error: "Claim not found. Issue a claim first." });
    }

    const svc = await getProofService();
    const result = await svc.generateProofAndMint(signedClaim);

    return {
      badgeId: result.badgeId.toString(),
      claimType: result.claimType,
      expiresAt: Number(result.expiresAt),
      subjectHash: result.subjectHash,
      issuerHash: result.issuerHash,
      proofGenTimeMs: result.proofGenTimeMs,
    };
  });
}
