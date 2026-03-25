# E-PoH Compact Contract Interface

## Overview

A single Compact contract (`contracts/epoh_badge.compact`) handles all on-chain logic:
- Issuer registration (ledger-based whitelist)
- Badge minting with ZK proof verification
- Badge revocation
- Hash-based identity derivation (pure circuits)

## Ledger State

```compact
export ledger authority: Bytes<32>;            // Owner's public key
export ledger round: Counter;                  // Rotation counter for key derivation
export ledger issuer_0: Bytes<32>;             // Issuer slot 0
export ledger issuer_1: Bytes<32>;             // Issuer slot 1
export ledger issuer_2: Bytes<32>;             // Issuer slot 2
export ledger issuer_3: Bytes<32>;             // Issuer slot 3
export ledger issuer_count: Counter;           // Number of registered issuers
export ledger badge_count: Counter;            // Total badges minted
export ledger last_badge_claim_type: Uint<8>;  // Type of most recent badge
export ledger last_badge_expires_at: Uint<64>; // Expiry of most recent badge
export ledger last_badge_subject_hash: Bytes<32>;  // Subject hash
export ledger last_badge_issuer_hash: Bytes<32>;   // Issuer hash
export ledger last_badge_state: BadgeState;    // EMPTY, ACTIVE, or REVOKED
```

## Enums

```compact
enum ClaimType { VACCINATED, TEST_NEGATIVE, MEDICALLY_FIT }
enum BadgeState { EMPTY, ACTIVE, REVOKED }
```

## Witnesses

```compact
witness ownerSecretKey(): Bytes<32>;   // Contract owner's secret key
witness issuerSecretKey(): Bytes<32>;  // Issuer's secret key for badge minting
```

In TypeScript, witnesses are implemented as:
```typescript
const witnesses: Witnesses<EPoHPrivateState> = {
  ownerSecretKey: ({ privateState }) => [privateState, privateState.ownerSecretKey],
  issuerSecretKey: ({ privateState }) => [privateState, privateState.issuerSecretKey],
};
```

## Circuits

### Constructor

```compact
constructor(sk: Bytes<32>) {
  authority = disclose(derivePublicKey(sk, round as Field as Bytes<32>));
  last_badge_state = BadgeState.EMPTY;
}
```

Deploys the contract with the owner's public key derived from their secret key.

### addIssuer (owner-only)

```compact
export circuit addIssuer(issuer_pk: Bytes<32>): []
```

- Verifies caller is the owner via `ownerSecretKey` witness
- Adds the issuer public key to the next available slot (max 4)
- Increments `issuer_count`

### mintBadge

```compact
export circuit mintBadge(
  claim_type: Uint<8>,
  subject_address: Bytes<32>,
  issued_at: Uint<64>,
  expires_at: Uint<64>
): []
```

**Constraints enforced in the circuit:**
1. `claim_type <= 2` — valid claim type
2. `expires_at > issued_at` — expiry after issuance
3. Issuer's secret key (witness) derives to a registered public key
4. Subject hash computed via `hashSubject(subject_address)`

**Issuer verification (privacy-preserving):**
```compact
const m0 = (issuer_0 == issuer_pk) as Uint<8>;
const m1 = (issuer_1 == issuer_pk) as Uint<8>;
const m2 = (issuer_2 == issuer_pk) as Uint<8>;
const m3 = (issuer_3 == issuer_pk) as Uint<8>;
assert(m0 + m1 + m2 + m3 > 0, "Issuer not registered");
```

Uses arithmetic sum instead of `||` to avoid witness-value disclosure through conditional branches.

### revokeBadge (owner-only)

```compact
export circuit revokeBadge(): []
```

- Requires an active badge (`last_badge_state == BadgeState.ACTIVE`)
- Verifies caller is the owner
- Sets `last_badge_state = BadgeState.REVOKED`

### Pure Circuits

```compact
export pure circuit derivePublicKey(sk: Bytes<32>, seq: Bytes<32>): Bytes<32>
```
Derives a public key from a secret key and sequence number using:
```
persistentHash<Vector<3, Bytes<32>>>(["ephemera:epoh:pk", seq, sk])
```

```compact
export pure circuit hashSubject(subject: Bytes<32>): Bytes<32>
```
Hashes a subject address using:
```
persistentHash<Vector<2, Bytes<32>>>(["ephemera:epoh:sub", subject])
```

## TypeScript API

After compilation, import the contract:

```typescript
import {
  Contract,
  ledger as readLedger,
  pureCircuits,
  BadgeState,
  type Ledger,
  type Witnesses,
} from "../contracts/managed/epoh_badge/contract/index.js";
```

### Using Pure Circuits (no network)

```typescript
const publicKey = pureCircuits.derivePublicKey(secretKey, sequenceBytes);
const subjectHash = pureCircuits.hashSubject(subjectAddress);
```

### Calling Impure Circuits (requires network)

```typescript
const context = { currentPrivateState: privateState, ...currentState };
const { result, proofData } = contract.circuits.mintBadge(
  context, claimType, subjectAddress, issuedAt, expiresAt
);
// Submit via wallet SDK
const recipe = await wallet.finalizeRecipe(proofData);
await wallet.submitTransaction(recipe);
```

## Deployment

```bash
# Compile the contract
compact compile contracts/epoh_badge.compact contracts/managed/epoh_badge

# Deploy (initializes wallet, connects to local network)
pnpm --filter backend exec tsx src/scripts/deploy.ts
```
