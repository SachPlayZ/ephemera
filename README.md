# E-PoH: Ephemeral Proof of Health

Privacy-preserving zero-knowledge health badges on [Midnight](https://midnight.network) (EVM-compatible). Prove vaccination status, test results, or medical fitness on-chain without revealing any personal medical data.

Badges are **soulbound** (non-transferable), **ephemeral** (auto-expire), and **verifiable** by anyone via QR code.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Healthcare  │────>│   Backend    │────>│  Noir Circuit    │
│   Provider   │     │  (Fastify)   │     │  (ZK Proving)    │
└─────────────┘     └──────┬───────┘     └────────┬─────────┘
                           │                       │
                     issue claim              generate proof
                           │                       │
                    ┌──────▼───────────────────────▼──────┐
                    │         Midnight Chain (EVM)         │
                    │  ┌───────────┐  ┌────────────────┐  │
                    │  │ Issuer    │  │  EPoH Badge    │  │
                    │  │ Registry  │  │  (ERC-721)     │  │
                    │  └───────────┘  └───────┬────────┘  │
                    │                 ┌───────▼────────┐  │
                    │                 │ Honk Verifier  │  │
                    │                 │ (ZK Proof)     │  │
                    │                 └────────────────┘  │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │        Frontend (Next.js)           │
                    │  Dashboard / Request / QR Verify    │
                    └────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ZK Circuits | **Noir** 1.0.0-beta.19 + **Poseidon2** |
| Proof System | **UltraHonk** (Barretenberg) |
| Signatures | **ECDSA secp256k1** (Ethereum-native) |
| Smart Contracts | **Solidity** 0.8.27 + **Foundry** + **OpenZeppelin v5** |
| Backend | **Node.js** + **TypeScript** + **Fastify** + **viem** |
| Frontend | **Next.js 16** + **Tailwind CSS v4** + **Lucide Icons** |
| Target Chain | **Midnight** (EVM-compatible) |

## Project Structure

```
ephemera/
├── circuits/                 # Noir ZK circuits
│   ├── epoh_badge/
│   │   ├── Nargo.toml
│   │   ├── Prover.toml       # Test inputs
│   │   └── src/main.nr       # Core circuit (ECDSA + Poseidon2)
│   └── scripts/
│       ├── gen_test_fixtures.mjs   # Generate test data
│       └── prove.mjs              # JS-based proof generation
├── contracts/                # Solidity (Foundry)
│   ├── src/
│   │   ├── Verifier.sol      # Auto-generated UltraHonk verifier
│   │   ├── EPoHBadge.sol     # Soulbound ERC-721 + ZK verification
│   │   └── IssuerRegistry.sol # Trusted issuer whitelist
│   ├── test/                 # Foundry tests (19 tests)
│   └── script/
│       ├── Deploy.s.sol      # Deployment script
│       └── MintBadge.s.sol   # Badge minting helper
├── backend/                  # API server
│   └── src/
│       ├── index.ts          # Fastify entry
│       ├── routes/           # /issue-claim, /generate-proof, /verify
│       ├── services/         # issuer, proof, chain services
│       └── test/             # E2E tests (3 tests)
├── frontend/                 # Web app
│   └── app/
│       ├── page.tsx          # Landing page
│       ├── badges/           # Badge dashboard
│       ├── request/          # Badge request flow
│       ├── verify/[id]/      # QR verification page
│       ├── components/       # Navbar, BadgeCard
│       ├── hooks/            # useProof (Web Worker)
│       └── lib/              # proof-worker.ts
└── docs/                     # Design documentation
    ├── architecture.md
    ├── proof-schema.md
    ├── contract-interface.md
    └── threat-model.md
```

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | >= 20.x | [nodejs.org](https://nodejs.org) |
| **pnpm** | >= 9.x | `npm install -g pnpm` |
| **Nargo** (Noir) | 1.0.0-beta.19 | `curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash && noirup -v 1.0.0-beta.19` |
| **Foundry** | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url> ephemera
cd ephemera
pnpm install
```

### 2. Install Foundry Dependencies

```bash
cd contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
cd ..
```

### 3. Compile the Noir Circuit

```bash
cd circuits/epoh_badge
nargo compile
nargo test
```

Expected output:
```
[epoh_badge] Compiling...
[epoh_badge] Testing...
[pass] test_valid_claim
[pass] test_invalid_signature
[pass] test_invalid_claim_type
[pass] test_expiry_before_issuance
```

### 4. Generate Proof and Solidity Verifier

```bash
cd ../scripts
node prove.mjs
```

This will:
- Generate a UltraHonk proof (~500ms, 8768 bytes)
- Verify the proof locally
- Write the Solidity verifier to `contracts/src/Verifier.sol`

### 5. Build and Test Contracts

```bash
cd ../../contracts
forge build
forge test -vvv
```

Expected: **19 tests passing** (7 IssuerRegistry + 11 EPoHBadge unit + 1 integration with real ZK proof).

### 6. Deploy to Anvil (Local Testnet)

Terminal 1 — Start Anvil:
```bash
anvil --code-size-limit 50000
```

> The `--code-size-limit` flag is needed because the HonkVerifier contract (33KB) exceeds EIP-170's 24KB limit. Midnight and most L2s support larger contracts.

Terminal 2 — Deploy:
```bash
cd contracts

# Using Hardhat account #0 as deployer
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
INITIAL_ISSUER_HASH=0x16b085b3d759d330bcf290a3fdbf56595330d4acbd57e8ae9360f09e22206112 \
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --code-size-limit 50000
```

Expected output:
```
HonkVerifier deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
IssuerRegistry deployed at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
EPoHBadge deployed at: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
Registered initial issuer
```

### 7. Start the Backend

```bash
cd ../backend

ISSUER_PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
RPC_URL=http://127.0.0.1:8545 \
BADGE_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
REGISTRY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 \
pnpm dev
```

The API server starts at `http://localhost:3001`. Test it:

```bash
# Issue a health claim
curl -X POST http://localhost:3001/issue-claim \
  -H "Content-Type: application/json" \
  -d '{
    "claimType": 0,
    "subjectAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "issuedAt": 1711929600,
    "expiresAt": 1812016000
  }'

# Generate a ZK proof (uses the claimId from above)
curl -X POST http://localhost:3001/generate-proof \
  -H "Content-Type: application/json" \
  -d '{"claimId": "<claimId-from-above>"}'
```

### 8. Start the Frontend

```bash
cd ../frontend
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

**Pages:**
- `/` — Landing page
- `/badges` — Badge dashboard with live countdown timers
- `/request` — Request a new badge (issue claim + generate proof)
- `/verify/0` — Verify a badge via QR code

### 9. Run Backend Tests

```bash
cd ../backend
pnpm test
```

Expected: **3 tests passing** (full issue -> prove -> verify pipeline).

## Running Everything Together

Open 3 terminals:

```bash
# Terminal 1: Local blockchain
anvil --code-size-limit 50000

# Terminal 2: Backend API
cd backend
ISSUER_PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 pnpm dev

# Terminal 3: Frontend
cd frontend
pnpm dev
```

Then visit [http://localhost:3000](http://localhost:3000).

## All Test Commands

```bash
# Circuit tests (4 tests)
pnpm test:circuits

# Contract tests (19 tests)
pnpm test:contracts

# Backend tests (3 tests)
pnpm test:backend
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/issue-claim` | Sign a health claim (requires `ISSUER_PRIVATE_KEY`) |
| `POST` | `/generate-proof` | Generate ZK proof from a signed claim |
| `GET` | `/claim/:claimId` | Retrieve a signed claim |
| `GET` | `/verify/:badgeId` | Check badge validity on-chain |
| `GET` | `/health` | Health check |

### POST /issue-claim

```json
{
  "claimType": 0,
  "subjectAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "issuedAt": 1711929600,
  "expiresAt": 1812016000
}
```

Claim types: `0` = Vaccinated, `1` = Test Negative, `2` = Medically Fit.

### POST /generate-proof

```json
{
  "claimId": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8-0-1711929600"
}
```

Returns the ZK proof (~8.7KB), public inputs, and generation time (~500ms).

## Smart Contracts

| Contract | Description | Gas |
|----------|-------------|-----|
| `HonkVerifier.sol` | Auto-generated UltraHonk verifier | — |
| `IssuerRegistry.sol` | Ownable whitelist of issuer pubkey hashes | ~35K (add) |
| `EPoHBadge.sol` | Soulbound ERC-721 with ZK proof-gated minting | ~3.2M (mint) |

### EPoHBadge Public Functions

- `mintBadge(bytes proof, bytes32[] publicInputs)` — Mint a badge with a valid ZK proof
- `isValid(uint256 tokenId)` — Check if a badge is still active (not expired)
- `getBadge(uint256 tokenId)` — Get badge data (claimType, expiresAt, hashes)
- `burn(uint256 tokenId)` — Burn your own badge

## Circuit Details

The Noir circuit (`circuits/epoh_badge/src/main.nr`) enforces 5 constraints:

1. **C1**: ECDSA secp256k1 signature is valid over `keccak256(abi.encodePacked(claimType, subject, issuedAt, expiresAt))`
2. **C2**: `issuerPubkeyHash == Poseidon2(pubkey_x, pubkey_y)`
3. **C3**: `subjectHash == Poseidon2(subjectAddress)`
4. **C4**: `expiresAt > issuedAt`
5. **C5**: `claimType` in `{0, 1, 2}`

**Private inputs**: All claim data, issuer pubkey, signature, message hash.
**Public outputs**: `claimType`, `expiresAt`, `subjectHash`, `issuerPubkeyHash`.

## Benchmarks

| Metric | Value |
|--------|-------|
| Witness generation | ~33ms |
| Proof generation | ~500ms |
| Proof verification (off-chain) | ~115ms |
| Proof size | 8,768 bytes |
| On-chain verification gas | ~3.2M |
| Verification key size | 1,888 bytes |

## Environment Variables

```env
# Backend
ISSUER_PRIVATE_KEY=       # Issuer's secp256k1 private key (hex, no 0x prefix)
RPC_URL=                  # Chain RPC URL (default: http://127.0.0.1:8545)
BADGE_ADDRESS=            # Deployed EPoHBadge contract address
REGISTRY_ADDRESS=         # Deployed IssuerRegistry contract address
PORT=3001                 # Backend port

# Frontend
NEXT_PUBLIC_API_URL=      # Backend API URL (default: http://localhost:3001)

# Deployment
DEPLOYER_PRIVATE_KEY=     # Deployer wallet private key
INITIAL_ISSUER_HASH=      # Optional: register an issuer on deploy
```

## License

MIT
