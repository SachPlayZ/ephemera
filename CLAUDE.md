# Compact Smart Contract Language — Midnight Network

## Overview

Compact is a strongly statically typed, domain-specific language (DSL) for writing
smart contracts on the Midnight blockchain. It compiles to zero-knowledge (ZK) circuits
and is designed to be accessible to TypeScript developers.

Midnight contracts have three components:

- A replicated component on a public ledger (on-chain state)
- A zero-knowledge circuit component (proves correctness confidentially)
- A local, off-chain component (arbitrary TypeScript code)

---

## Contract Structure

Every Compact contract follows this general structure:

```compact
pragma language_version 0.22;

import CompactStandardLibrary;

// (Optional) Enum or struct type declarations

// Ledger declarations (public on-chain state)
export ledger <name>: <Type>;

// (Optional) Constructor
constructor(<params>) {
  // Initialize ledger fields
}

// (Optional) Witness declarations (private data supplied by TypeScript)
witness <name>(): <Type>;

// Circuit definitions (entry points / logic)
export circuit <name>(<params>): <ReturnType> {
  // logic
}
```

````

---

## Key Language Concepts

### `pragma language_version`

- Must be the first line of every contract.
- Locks the contract to a specific Compact compiler version.
- Example: `pragma language_version 0.22;`

### `import CompactStandardLibrary`

- Loads built-in types and functions such as `Counter`, `Bytes`, `Uint`, etc.

### `ledger` Declarations

- Defines public, persistent on-chain state.
- Visible to all network participants.
- Use `export` to make fields accessible from the TypeScript API.
- Example:
  ```compact
  export ledger round: Counter;
  export ledger message: Opaque<"string">;
  export ledger authority: Bytes<32>;
  export ledger value: Uint<64>;
  ```

### `constructor`

- Optional. Initializes ledger fields when the contract is deployed.
- Example:
  ```compact
  constructor(sk: Bytes<32>, v: Uint<64>) {
    authority = disclose(publicKey(round, sk));
    value = disclose(v);
    state = State.SET;
  }
  ```

### `circuit` Definitions

- Equivalent to functions; compiled into ZK circuits.
- Must have typed parameters and a return type.
- Return type `[]` means no return value (unit type).
- All paths through a circuit must end with `return`, unless return type is `[]`.
- Use `export` to make a circuit callable externally.
- Example:
  ```compact
  export circuit increment(): [] {
    round.increment(1);
  }
  ```

### Pure vs. Impure Circuits

- **Pure**: Computes outputs from inputs only; no ledger or witness access.
  - Declared with `pure circuit` or `export pure circuit`.
  - Available via `pureCircuits` in the TypeScript API.
- **Impure**: Accesses or modifies ledger state, or calls witnesses.
  - Default for circuits that interact with on-chain state.

### `witness` Functions

- Declare private data to be supplied by the TypeScript layer.
- Example:
  ```compact
  witness secretKey(): Bytes<32>;
  ```
- In TypeScript, implement witnesses as a `witnesses` object passed to the contract constructor.

### `disclose()`

- Marks a private (circuit parameter) value as safe to store publicly on the ledger.
- Circuit parameters are **private by default**.
- Without `disclose()`, assigning a circuit parameter to a ledger field is a compiler error.
- Example:
  ```compact
  export circuit storeMessage(newMessage: Opaque<"string">): [] {
    message = disclose(newMessage);
  }
  ```

### `assert()`

- Enforces conditions; halts execution if the condition is false.
- Example:
  ```compact
  assert(state == State.SET, "Attempted to get uninitialized value");
  ```

---

## Built-in Types (from CompactStandardLibrary)

| Type               | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `Counter`          | Auto-initializes to zero; supports `.increment(n)` and `.decrement(n)` |
| `Bytes<N>`         | Fixed-size byte array of N bytes                                       |
| `Uint<N>`          | Unsigned integer of N bits (e.g., `Uint<64>`)                          |
| `Opaque<"string">` | Opaque string type for public string storage                           |
| `Field`            | Field element used in ZK arithmetic                                    |
| `Vector<N, T>`     | Fixed-size vector of N elements of type T                              |

---

## User-Defined Types

### Enums

```compact
enum State {
  UNSET,
  SET
}
```

### Structs

Custom data structures can be defined with `struct`. See the language reference for details.

---

## Complete Example Contracts

### Minimal Counter Contract

```compact
pragma language_version 0.21;

import CompactStandardLibrary;

// public state
export ledger round: Counter;

// transition function changing public state
export circuit increment(): [] {
  round.increment(1);
}
```

### Message Storage Contract

```compact
pragma language_version 0.22;

export ledger message: Opaque<"string">;

export circuit storeMessage(newMessage: Opaque<"string">): [] {
  message = disclose(newMessage);
}
```

### Full Lock/Value Contract (with auth)

```compact
pragma language_version 0.22;

import CompactStandardLibrary;

enum State {
  UNSET,
  SET
}

export ledger authority: Bytes<32>;
export ledger value: Uint<64>;
export ledger state: State;
export ledger round: Counter;

constructor(sk: Bytes<32>, v: Uint<64>) {
  authority = disclose(publicKey(round, sk));
  value = disclose(v);
  state = State.SET;
}

circuit publicKey(round: Field, sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>(
           [pad(32, "midnight:examples:lock:pk"), round as Bytes<32>, sk]);
}

export circuit get(): Uint<64> {
  assert(state == State.SET, "Attempted to get uninitialized value");
  return value;
}

witness secretKey(): Bytes<32>;

export circuit set(v: Uint<64>): [] {
  assert(state == State.UNSET, "Attempted to set initialized value");
  const sk = secretKey();
  const pk = publicKey(round, sk);
  authority = disclose(pk);
  value = disclose(v);
  state = State.SET;
}

export circuit clear(): [] {
  assert(state == State.SET, "Attempted to clear uninitialized value");
  const sk = secretKey();
  const pk = publicKey(round, sk);
  assert(authority == pk, "Attempted to clear without authorization");
  state = State.UNSET;
  round.increment(1);
}
```

---

## Compilation

```bash
compact compile contracts/my-contract.compact contracts/managed
```

Compilation outputs:

- `contract/index.js` — JavaScript implementation
- `contract/index.d.ts` — TypeScript type definitions
- `keys/` — ZK proving and verifying keys
- `zkir/` — Zero-Knowledge Intermediate Representation
- `compiler/` — Compiler-generated JSON

---

## TypeScript Integration

After compilation, import the contract in TypeScript:

```typescript
import {
  Contract,
  State,
  pureCircuits,
  ledger,
} from "./managed/bboard/contract/index.js";
```

### Witnesses (TypeScript side)

```typescript
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, BBoardPrivateState>): [
    BBoardPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],
};
```

### Calling Circuits

```typescript
const { result, context, proofData, gasCost } = contract.circuits.post(
  initialContext,
  message,
);
```

### Calling Pure Circuits

```typescript
const ownerCommitment = pureCircuits.publicKey(secretKey, sequenceBytes);
```

---

## Important Rules

1. **Never manually edit generated files** (`index.js`, `index.d.ts`). Recompile after any contract change.
2. **Circuit parameters are private by default.** Use `disclose()` to make values public.
3. **Generic circuits cannot be exported.**
4. **Check the compatibility matrix** to ensure `@midnight-ntwrk/compact-runtime` version matches the compiler version.
5. Midnight is **not EVM compatible**. Do not use Solidity patterns.

This `CLAUDE.md` is grounded entirely in the Midnight documentation. [[Writing a Contract](https://docs.midnight.network/compact/writing); [Compact Reference](https://docs.midnight.network/compact/reference/lang-ref)] [[Counter DApp](https://docs.midnight.network/examples/dapps/counter); [JS Implementation Guide](https://docs.midnight.network/guides/compact-javascript-runtime)]
````
