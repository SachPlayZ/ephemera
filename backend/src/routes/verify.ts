import type { FastifyInstance } from "fastify";
import { ChainService, BadgeState } from "../services/chain.service.js";

export async function verifyRoutes(app: FastifyInstance) {
  app.get("/badges", async (request, reply) => {
    const nodeUrl = process.env.MIDNIGHT_NODE_URL ?? "http://127.0.0.1:9944";
    const indexerUrl = process.env.MIDNIGHT_INDEXER_URL ?? "http://127.0.0.1:8088/api/v3/graphql";
    const indexerWsUrl = process.env.MIDNIGHT_INDEXER_WS_URL ?? "ws://127.0.0.1:8088/api/v3/graphql/ws";
    const proofServerUrl = process.env.MIDNIGHT_PROOF_SERVER_URL ?? "http://127.0.0.1:6300";

    const { subjectAddress } = request.query as { subjectAddress?: string };
    if (!subjectAddress || !/^0x[a-fA-F0-9]{64}$/.test(subjectAddress)) {
      return reply.status(400).send({
        error: "subjectAddress is required and must be 32-byte hex (0x + 64 hex chars)",
      });
    }

    const chain = new ChainService({
      nodeUrl,
      indexerUrl,
      indexerWsUrl,
      proofServerUrl,
      networkId: process.env.MIDNIGHT_NETWORK_ID ?? "undeployed",
      contractAddress: process.env.EPOH_CONTRACT_ADDRESS,
    });

    try {
      const latest = await chain.getLatestBadge();
      const count = await chain.getBadgeCount();
      const valid = await chain.isValid();

      const expectedSubjectHash = chain.hashSubject(hexToBytes32(subjectAddress));
      const matches = bytesEqual(expectedSubjectHash, latest.subjectHash);

      if (!matches) return [];

      return [
        {
          tokenId: Number(count),
          claimType: latest.claimType,
          expiresAt: Number(latest.expiresAt),
          subjectHash: toHex(latest.subjectHash),
          issuerHash: toHex(latest.issuerHash),
          valid,
          state: BadgeState[latest.state],
        },
      ];
    } catch (e: any) {
      return reply.status(500).send({ error: "Failed to query badges", details: e.message });
    }
  });

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
      contractAddress: process.env.EPOH_CONTRACT_ADDRESS,
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

function hexToBytes32(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").padEnd(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
