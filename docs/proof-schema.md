# E-PoH Proof Schema

## Health Claim Types

| Value | Name | Description |
|-------|------|-------------|
| `0` | `VACCINATED` | Subject has received required vaccination |
| `1` | `TEST_NEGATIVE` | Subject tested negative (with timestamp) |
| `2` | `MEDICALLY_FIT` | Subject declared medically fit by provider |

## Claim Structure

A health claim is the raw data signed by an issuer (hospital, lab, oracle) and provided to the ZK circuit as private input.

```
HealthClaim {
    claim_type:       u8          // 0, 1, or 2
    subject_address:  [u8; 20]    // Ethereum address of the badge recipient
    issued_at:        u64         // Unix timestamp of issuance
    expires_at:       u64         // Unix timestamp of expiry
}
```

The issuer signs `keccak256(abi.encodePacked(claim_type, subject_address, issued_at, expires_at))` using their secp256k1 private key (standard Ethereum signature).

## Circuit Inputs

### Private Inputs (witness — known only to prover)

| Name | Type | Description |
|------|------|-------------|
| `claim_type` | `u8` | Health claim type enum |
| `subject_address` | `[u8; 20]` | Ethereum address of subject |
| `issued_at` | `u64` | Issuance timestamp |
| `expires_at` | `u64` | Expiry timestamp |
| `issuer_pubkey_x` | `[u8; 32]` | Issuer's secp256k1 public key X coordinate |
| `issuer_pubkey_y` | `[u8; 32]` | Issuer's secp256k1 public key Y coordinate |
| `signature` | `[u8; 64]` | ECDSA signature (r, s) over the hashed message |
| `hashed_message` | `[u8; 32]` | keccak256 hash of the encoded claim data |

### Public Outputs (revealed to verifier)

| Name | Type | Description |
|------|------|-------------|
| `claim_type` | `u8` | Which health status is being claimed |
| `expires_at` | `u64` | When the badge expires (checked on-chain) |
| `subject_hash` | `Field` | Poseidon2 hash of subject_address (privacy-preserving identity binding) |
| `issuer_pubkey_hash` | `Field` | Poseidon2 hash of issuer public key (checked against IssuerRegistry) |

## Circuit Constraints

### C1: Valid Issuer Signature
```
ecdsa_secp256k1::verify_signature(issuer_pubkey_x, issuer_pubkey_y, signature, hashed_message) == true
```
Proves the claim was signed by the issuer's private key without revealing the key.

### C2: Issuer Public Key Hash
```
issuer_pubkey_hash == Poseidon2(issuer_pubkey_x || issuer_pubkey_y)
```
Outputs a deterministic hash of the issuer's public key. The on-chain IssuerRegistry checks this hash is whitelisted, without the circuit revealing the full public key.

### C3: Subject Identity Binding
```
subject_hash == Poseidon2(subject_address)
```
Binds the badge to the subject's wallet address without revealing it on-chain. The smart contract additionally checks `subject_hash == Poseidon2(msg.sender)` at mint time.

### C4: Expiry Sanity Check
```
expires_at > issued_at
```
Prevents nonsensical claims where expiry precedes issuance. Actual expiry enforcement is on-chain via `block.timestamp`.

### C5: Valid Claim Type
```
claim_type <= 2
```
Ensures the claim type is within the defined enum range.

## Proof Flow

```
1. Issuer signs claim off-chain (standard Ethereum signature)
2. User receives signed claim (encrypted, stored on IPFS)
3. User provides claim + signature as private inputs to circuit
4. Circuit verifies all 5 constraints
5. Circuit outputs: claim_type, expires_at, subject_hash, issuer_pubkey_hash
6. Proof submitted to EPoHBadge contract on-chain
7. Contract verifies proof, checks issuer_pubkey_hash in registry, checks expiry
8. Soulbound badge minted to user
```
