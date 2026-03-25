# E-PoH: Ephemeral Proof of Health

Privacy-preserving zero-knowledge health badges on [Midnight](https://midnight.network). Prove vaccination status, test results, or medical fitness on-chain without revealing any personal medical data.

Badges are **soulbound** (non-transferable), **ephemeral** (auto-expire), and **verifiable** by anyone via QR code.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Healthcare  │────>│   Backend    │────>│  Compact Circuit  │
│   Provider   │     │  (Fastify)   │     │  (ZK Proving)     │
└─────────────┘     └──────┬───────┘     └────────┬──────────┘
                           │                       │
                     issue claim              generate proof
                           │                       │
                    ┌──────▼───────────────────────▼──────┐
                    │         Midnight Network             │
                    │  ┌───────────┐  ┌────────────────┐  │
                    │  │ Issuer    │  │  E-PoH Badge   │  │
                    │  │ Registry  │  │  (Soulbound)   │  │
                    │  │ (ledger)  │  └───────┬────────┘  │
                    │  └───────────┘  ┌───────▼────────┐  │
                    │                 │  Proof Server   │  │
                    │                 │  (ZK Proofs)    │  │
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
| ZK Circuits | **Compact** (Midnight DSL) + **persistentHash** |
| Proof System | **Midnight Proof Server** (docker, port 6300) |
| Key Derivation | **Hash-based** (persistentHash, no ECDSA) |
| Smart Contract | **Compact** 0.22 (compiled to ZK circuits) |
| Wallet SDK | **Midnight Wallet SDK** v2.0 (HDWallet, Shielded, Dust) |
| Backend | **Node.js** + **TypeScript** + **Fastify** |
| Frontend | **Next.js 16** + **Tailwind CSS v4** + **Lucide Icons** |
| Target Chain | **Midnight** (privacy-first, ZK-native) |

## Project Structure

```
ephemera/
├── contracts/
│   ├── epoh_badge.compact      # Compact contract source
│   └── managed/                # Compiled output (auto-generated)
│       └── epoh_badge/
│           ├── contract/       # index.js, index.d.ts (TypeScript API)
│           ├── keys/           # ZK proving & verifying keys
│           ├── zkir/           # ZK intermediate representation
│           └── compiler/       # Compiler metadata
├── backend/                    # API server
│   └── src/
│       ├── index.ts            # Fastify entry
│       ├── routes/             # /issue-claim, /generate-proof, /verify
│       ├── services/           # chain, issuer, proof services
│       ├── scripts/            # deploy.ts
│       └── test/               # E2E tests (3 tests)
├── frontend/                   # Web app
│   └── app/
│       ├── page.tsx            # Landing page
│       ├── badges/             # Badge dashboard
│       ├── request/            # Badge request flow
│       ├── verify/[id]/        # QR verification page
│       ├── components/         # Navbar, BadgeCard
│       ├── hooks/              # useProof
│       └── lib/                # proof-worker.ts
├── docker-compose.yml          # Midnight local network
├── standalone.env              # Indexer config
└── docs/                       # Design documentation
```

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | >= 20.x | [nodejs.org](https://nodejs.org) |
| **pnpm** | >= 9.x | `npm install -g pnpm` |
| **Docker** | latest | [docker.com](https://docker.com) |
| **Compact** | 0.30.0 | `compact update 0.30.0` (after installing the CLI) |

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url> ephemera
cd ephemera
pnpm install
```

### 2. Start the Midnight Local Network

```bash
docker compose up -d
```

This starts three services:
- **Node** at `http://localhost:9944`
- **Indexer** at `http://localhost:8088/api/v3/graphql`
- **Proof Server** at `http://localhost:6300`

Wait for all containers to be healthy:
```bash
docker compose ps
```

### 3. Compile the Compact Contract

```bash
pnpm compact:compile
```

This compiles `contracts/epoh_badge.compact` and outputs:
- TypeScript bindings (`contracts/managed/epoh_badge/contract/`)
- Proving/verifying keys (`contracts/managed/epoh_badge/keys/`)
- ZK intermediate representation (`contracts/managed/epoh_badge/zkir/`)

### 4. Deploy the Contract

```bash
pnpm --filter backend exec tsx src/scripts/deploy.ts
```

The script derives a wallet from the mnemonic, connects to the local Midnight network, and initializes the contract. Set `MIDNIGHT_MNEMONIC` to use a custom mnemonic.

### 5. Start the Backend

```bash
cd backend
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

# Generate a ZK proof and mint badge
curl -X POST http://localhost:3001/generate-proof \
  -H "Content-Type: application/json" \
  -d '{"claimId": "<claimId-from-above>"}'
```

### 6. Start the Frontend

```bash
cd frontend
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

**Pages:**
- `/` — Landing page
- `/badges` — Badge dashboard with live countdown timers
- `/request` — Request a new badge (issue claim + mint on Midnight)
- `/verify/0` — Verify a badge via QR code

### 7. Run Tests

```bash
pnpm test:backend
```

Expected: **3 tests passing** (full issue -> prove -> verify pipeline).

## Running Everything Together

```bash
# Terminal 1: Start Midnight network
docker compose up -d

# Terminal 2: Backend API
cd backend && pnpm dev

# Terminal 3: Frontend
cd frontend && pnpm dev
```

Then visit [http://localhost:3000](http://localhost:3000).

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/issue-claim` | Sign a health claim (issuer creates a signed claim) |
| `POST` | `/generate-proof` | Generate ZK proof and mint badge on Midnight |
| `GET` | `/claim/:claimId` | Retrieve a signed claim |
| `GET` | `/verify/:badgeId` | Check badge validity on the Midnight ledger |
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

Returns the badge ID, claim metadata, and proof generation time.

## Compact Contract

The contract (`contracts/epoh_badge.compact`) handles all on-chain logic and ZK proof generation in a single file:

| Circuit | Description |
|---------|-------------|
| `addIssuer(issuer_pk)` | Register an issuer (owner-only, max 4) |
| `mintBadge(claim_type, subject, issued_at, expires_at)` | Mint a health badge with ZK proof |
| `revokeBadge()` | Revoke the active badge (owner-only) |
| `derivePublicKey(sk, seq)` | Pure circuit: derive public key from secret |
| `hashSubject(subject)` | Pure circuit: hash a subject address |

### Ledger State

| Field | Type | Description |
|-------|------|-------------|
| `authority` | `Bytes<32>` | Owner's public key |
| `issuer_0..3` | `Bytes<32>` | Registered issuer public keys |
| `issuer_count` | `Counter` | Number of registered issuers |
| `badge_count` | `Counter` | Total badges minted |
| `last_badge_state` | `BadgeState` | EMPTY, ACTIVE, or REVOKED |
| `last_badge_claim_type` | `Uint<8>` | Type of the last badge |
| `last_badge_expires_at` | `Uint<64>` | Expiry timestamp |

### Privacy Model

- **Private inputs**: Issuer secret key, owner secret key (provided as witnesses)
- **Public outputs**: Claim type, expiry, subject hash, issuer hash, badge state
- **Key insight**: The Compact circuit proves the issuer is registered *without revealing which issuer* — it uses arithmetic sums instead of short-circuit OR to avoid witness-value disclosure

## Environment Variables

```env
# Backend
ISSUER_SECRET_KEY=        # Issuer's secret key (hex, 32 bytes)
MIDNIGHT_NODE_URL=        # Node URL (default: http://127.0.0.1:9944)
MIDNIGHT_INDEXER_URL=     # Indexer URL (default: http://127.0.0.1:8088/api/v3/graphql)
MIDNIGHT_INDEXER_WS=      # Indexer WS (default: ws://127.0.0.1:8088/api/v3/graphql/ws)
MIDNIGHT_PROOF_SERVER=    # Proof server URL (default: http://127.0.0.1:6300)
MIDNIGHT_MNEMONIC=        # Wallet mnemonic (24 words)
PORT=3001                 # Backend port

# Frontend
NEXT_PUBLIC_API_URL=      # Backend API URL (default: http://localhost:3001)
```

## Docker Services

| Service | Port | Image |
|---------|------|-------|
| Midnight Node | 9944 | `midnightntwrk/midnight-node:0.21.0` |
| Indexer | 8088 | `midnightntwrk/indexer-standalone:3.1.0` |
| Proof Server | 6300 | `midnightntwrk/proof-server:7.0.0` |

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Logs
docker compose logs -f
```

## License

MIT
