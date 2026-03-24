/**
 * Chain Service — Interacts with EPoHBadge and IssuerRegistry contracts via viem.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const EPOH_BADGE_ABI = [
  {
    type: "function",
    name: "mintBadge",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isValid",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBadge",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "claimType", type: "uint8" },
          { name: "expiresAt", type: "uint64" },
          { name: "subjectHash", type: "bytes32" },
          { name: "issuerPubkeyHash", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

const ISSUER_REGISTRY_ABI = [
  {
    type: "function",
    name: "isIssuer",
    inputs: [{ name: "pubkeyHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addIssuer",
    inputs: [{ name: "pubkeyHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export interface Badge {
  claimType: number;
  expiresAt: bigint;
  subjectHash: Hex;
  issuerPubkeyHash: Hex;
}

export class ChainService {
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private account: Account | null = null;
  private badgeAddress: Address;
  private registryAddress: Address;
  private chain: Chain;

  constructor(config: {
    rpcUrl: string;
    badgeAddress: Address;
    registryAddress: Address;
    chain?: Chain;
    privateKey?: Hex;
  }) {
    this.badgeAddress = config.badgeAddress;
    this.registryAddress = config.registryAddress;
    const chain = config.chain ?? foundry;
    this.chain = chain;

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    if (config.privateKey) {
      this.account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        chain,
        transport: http(config.rpcUrl),
        account: this.account,
      });
    }
  }

  async mintBadge(proof: Uint8Array, publicInputs: string[]): Promise<Hex> {
    if (!this.walletClient) throw new Error("No wallet configured for writes");

    const proofHex = ("0x" +
      Array.from(proof)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as Hex;

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account!,
      address: this.badgeAddress,
      abi: EPOH_BADGE_ABI,
      functionName: "mintBadge",
      args: [proofHex, publicInputs as Hex[]],
    });

    return hash;
  }

  async isValid(tokenId: bigint): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.badgeAddress,
      abi: EPOH_BADGE_ABI,
      functionName: "isValid",
      args: [tokenId],
    }) as Promise<boolean>;
  }

  async getBadge(tokenId: bigint): Promise<Badge> {
    const result = (await this.publicClient.readContract({
      address: this.badgeAddress,
      abi: EPOH_BADGE_ABI,
      functionName: "getBadge",
      args: [tokenId],
    })) as any;

    return {
      claimType: result.claimType,
      expiresAt: result.expiresAt,
      subjectHash: result.subjectHash,
      issuerPubkeyHash: result.issuerPubkeyHash,
    };
  }

  async isIssuer(pubkeyHash: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: ISSUER_REGISTRY_ABI,
      functionName: "isIssuer",
      args: [pubkeyHash],
    }) as Promise<boolean>;
  }

  async addIssuer(pubkeyHash: Hex): Promise<Hex> {
    if (!this.walletClient) throw new Error("No wallet configured for writes");
    return this.walletClient.writeContract({
      chain: this.chain,
      account: this.account!,
      address: this.registryAddress,
      abi: ISSUER_REGISTRY_ABI,
      functionName: "addIssuer",
      args: [pubkeyHash],
    });
  }
}
