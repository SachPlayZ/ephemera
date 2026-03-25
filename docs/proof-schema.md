# E-PoH Proof Schema

## Health Claim Types

| Value | Name | Description |
|-------|------|-------------|
| `0` | `VACCINATED` | Subject has received required vaccination |
| `1` | `TEST_NEGATIVE` | Subject tested negative (with timestamp) |
| `2` | `MEDICALLY_FIT` | Subject declared medically fit by provider |

## Claim Structure

A health claim is the data provided by an issuer and passed to the Compact circuit for ZK proof generation.

```typescript
interface ClaimData {
  claimType: number;      // 0, 1, or 2
  subjectAddress: string; // 32-byte hex identifier for the subject
  issuedAt: bigint;       // Unix timestamp of issuance
  expiresAt: bigint;      // Unix timestamp of expiry
}
```

The issuer holds a 32-byte secret key. Identity is proven by passing the secret key as a **witness** to the Compact circuit, which derives the public key via `persistentHash` and checks it against the on-ledger issuer registry.

## Circuit Inputs

### Private Inputs (witnesses — known only to prover)

| Name | Type | Description |
|------|------|-------------|
| `ownerSecretKey` | `Bytes<32>` | Owner's secret key (for addIssuer/revokeBadge) |
| `issuerSecretKey` | `Bytes<32>` | Issuer's secret key (for mintBadge) |

### Circuit Parameters

| Name | Type | Description |
|------|------|-------------|
| `claim_type` | `Uint<8>` | Health claim type enum (0-2) |
| `subject_address` | `Bytes<32>` | Subject's address (hashed on-chain) |
| `issued_at` | `Uint<64>` | Issuance timestamp |
| `expires_at` | `Uint<64>` | Expiry timestamp |

### Public Outputs (stored on ledger via `disclose()`)

| Name | Type | Description |
|------|------|-------------|
| `last_badge_claim_type` | `Uint<8>` | Which health status is being claimed |
| `last_badge_expires_at` | `Uint<64>` | When the badge expires |
| `last_badge_subject_hash` | `Bytes<32>` | persistentHash of subject address |
| `last_badge_issuer_hash` | `Bytes<32>` | Derived public key of the issuer |
| `last_badge_state` | `BadgeState` | EMPTY, ACTIVE, or REVOKED |

## Circuit Constraints

### C1: Valid Claim Type
```compact
assert(claim_type <= 2, "Invalid claim type");
```
Ensures the claim type is within the defined enum range.

### C2: Expiry Sanity Check
```compact
assert(expires_at > issued_at, "Expiry must be after issuance");
```
Prevents nonsensical claims where expiry precedes issuance.

### C3: Issuer Authorization
```compact
const isk = issuerSecretKey();
const issuer_pk = derivePublicKey(isk, round as Field as Bytes<32>);
const m0 = (issuer_0 == issuer_pk) as Uint<8>;
const m1 = (issuer_1 == issuer_pk) as Uint<8>;
const m2 = (issuer_2 == issuer_pk) as Uint<8>;
const m3 = (issuer_3 == issuer_pk) as Uint<8>;
assert(m0 + m1 + m2 + m3 > 0, "Issuer not registered");
```
Proves the issuer is registered without revealing which slot matched. Uses arithmetic sum instead of short-circuit OR to prevent witness-value disclosure through conditional branches.

### C4: Subject Identity Binding
```compact
const subject_hash = hashSubject(subject_address);
last_badge_subject_hash = disclose(subject_hash);
```
Binds the badge to the subject's address via a privacy-preserving hash.

### C5: Issuer Identity Binding
```compact
last_badge_issuer_hash = disclose(issuer_pk);
```
The derived public key (not the secret key) is disclosed to the ledger.

## Proof Flow

```
1. Issuer creates a signed claim with their secret key
2. Backend stores claim, returns claimId
3. User requests proof generation via POST /generate-proof
4. Backend calls the Compact mintBadge circuit:
   a. Issuer secret key provided as witness
   b. Circuit derives issuer public key via persistentHash
   c. Circuit checks issuer PK against registered issuers (arithmetic sum)
   d. Circuit computes subject hash via persistentHash
   e. All constraints verified
5. Midnight Proof Server generates the ZK proof
6. Wallet SDK submits the proven transaction to the Midnight node
7. Ledger state updated with badge data
8. Third parties verify badge validity via ledger state query
```

## Key Differences from EVM/Noir Approach

| Aspect | Old (Noir/Solidity) | New (Compact/Midnight) |
|--------|-------------------|----------------------|
| Proof system | UltraHonk (Barretenberg) | Midnight Proof Server |
| Signature scheme | ECDSA secp256k1 | Hash-based key derivation |
| Contract language | Solidity (3 contracts) | Compact (1 contract) |
| On-chain state | ERC-721 mappings | Compact ledger fields |
| Issuer check | On-chain registry lookup | In-circuit arithmetic verification |
| Privacy model | Public inputs/outputs | `disclose()` for public, witnesses for private |
| Proof generation | Browser WASM (bb.js) | Server-side (Midnight Proof Server) |
