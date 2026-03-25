import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IssuerService, type SignedClaim } from "../services/issuer.service.js";

const IssueClaimSchema = z.object({
  claimType: z.number().int().min(0).max(2),
  subjectAddress: z.string().regex(/^0x[a-fA-F0-9]{1,64}$/),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

// In-memory store for signed claims (keyed by claim ID)
const claimStore = new Map<string, SignedClaim>();

export async function claimRoutes(app: FastifyInstance) {
  const issuerKey = process.env.ISSUER_PRIVATE_KEY;
  if (!issuerKey) {
    app.log.warn("ISSUER_PRIVATE_KEY not set — /issue-claim will fail");
  }

  app.post("/issue-claim", async (request, reply) => {
    if (!issuerKey) {
      return reply.status(500).send({ error: "Issuer not configured" });
    }

    const parsed = IssueClaimSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const { claimType, subjectAddress, issuedAt, expiresAt } = parsed.data;
    const issuer = new IssuerService(issuerKey);

    const signedClaim = await issuer.signClaim({
      claimType,
      subjectAddress,
      issuedAt: BigInt(issuedAt),
      expiresAt: BigInt(expiresAt),
    });

    // Store with a simple key
    const claimId = `${subjectAddress}-${claimType}-${issuedAt}`;
    claimStore.set(claimId, signedClaim);

    return {
      claimId,
      claimType,
      subjectAddress,
      issuedAt,
      expiresAt,
    };
  });

  app.get("/claim/:claimId", async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const claim = claimStore.get(claimId);
    if (!claim) {
      return reply.status(404).send({ error: "Claim not found" });
    }
    return {
      claimId,
      claimType: claim.claim.claimType,
      subjectAddress: claim.claim.subjectAddress,
      issuedAt: Number(claim.claim.issuedAt),
      expiresAt: Number(claim.claim.expiresAt),
    };
  });
}

// Export for internal use by proof route
export { claimStore };
