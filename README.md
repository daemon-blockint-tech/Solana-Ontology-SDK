<p align="center">
  <img src="docs/solana-icon.png" alt="Solana" width="48" height="48" />
</p>

# Solana Ontology SDK

> Independent Semantic Ontology Layer for Solana Programs

A concept-centric SDK for building Solana applications with a **fully independent** ontology system. Define your on-chain concepts as YAML, validate them against a JSON Schema, generate typed SDK code, and interact with them at runtime using `@solana/kit` or `web3.js`. Includes an independent Ontology Metadata Service (OMS), MCP server for LLM agents, Yellowstone gRPC ingestion, and Helm deployment configs.

**Not dependent on Palantir Foundry or any external platform.**

## Architecture

```
ontology/                        YAML concept definitions + JSON Schema
packages/
  ontology-core/               Types, loader, validator, graph builder
  idl-parser/                  Anchor IDL v0/v1 parser + codemod + concept generator
  sdk/                         Runtime SDK (Kit client + web3.js adapter + Kinetic Action Layer)
  ingestion/                   Yellowstone gRPC client, state manager, reorg handling
  ontology-oms/                Independent Ontology Metadata Service (REST API)
  mcp-server/                  MCP server for LLM agents (resources + tools + OAuth)
  generator-client/            Typed React/TypeScript client library generator
  generator-ts/                TypeScript code generator (interfaces, decoders, actions, queries)
  generator-rust/              Rust code generator stub (structs, PDA helpers)
  cli/                         solana-ontology CLI (validate, generate, list, graph, idl)
  deploy/                      Helm chart + K8s deployment configs
```

## Packages

| Package                             | Description                                                              | Tests |
| ----------------------------------- | ------------------------------------------------------------------------ | ----- |
| `@solana-ontology/core`             | Core types, validator, loader, graph builder                             | ✅    |
| `@solana-ontology/idl-parser`       | Anchor IDL v0/v1 parser + codemod + concept generator                    | 10    |
| `@solana-ontology/sdk`              | Runtime SDK: ActionBuilder, TransactionLifecycle, signers, Borsh encoder | 17    |
| `@solana-ontology/ingestion`        | Yellowstone gRPC client, state manager with reorg handling               | 14    |
| `@solana-ontology/oms`              | Independent OMS — REST API, registries, pluggable storage                | 10    |
| `@solana-ontology/mcp-server`       | MCP server exposing ontology as LLM-callable resources and tools         | 14    |
| `@solana-ontology/generator-client` | Typed React/TypeScript client library generator                          | 6     |
| `@solana-ontology/generator-ts`     | TypeScript code generator                                                | ✅    |
| `@solana-ontology/generator-rust`   | Rust code generator                                                      | ✅    |
| `@solana-ontology/cli`              | CLI: validate, generate, list, graph, idl                                | ✅    |
| `@solana-ontology/deploy`           | Helm chart + K8s configs (devnet/testnet/mainnet)                        | —     |

**Total: 174 tests passing across 13 test suites.**

## Concept Categories

| Category           | Concepts                                                                            |
| ------------------ | ----------------------------------------------------------------------------------- |
| **primitive**      | Account, Program, Transaction, Instruction, PDA, Signer, ComputeBudget, Rent, Counter, TicTacToeGame, TicTacToePlay  |
| **token**          | TokenMint, TokenAccount, TokenExtension, NFT, Collection, Metadata, TransferHook, CompressedToken      |
| **defi**           | LiquidityPool, Position, Vault, OracleFeed, LendingMarket, SwapRoute, Escrow, AutomatedMarketMaker, Fundraiser, PaymentChallenge, MultiPartyPayment, PaymentSettlement |
| **governance**     | Proposal, Vote, Multisig, DAO, StakeAccount, ValidatorGovernance, NcnBallot, MerkleProofVerifier, CoralMultisig, MultisigTransaction |
| **infrastructure** | Cluster, Slot, Epoch, Validator, LightProtocolRegistry, AccountCompressionTree, LightSystemInvoke                     |
| **delivery**       | ProgramRelease, ReleaseChannel, Environment, UpgradeAuthority, DeploymentConstraint |
| **security**       | MissingSignerCheck, AccountSubstitution, MissingOwnerCheck, SplTokenConfusion, PdaSeedMismatch, IntegerOverflow, ArbitraryCpiInvocation, SignerAuthorization, AccountDataMatching, TypeCosplay, PdaSharing, BumpSeedCanonicalization, ClosingAccounts |
| **fuzzing**        | FuzzStrategy, FuzzFlow, FuzzInvariant                                                                       |
| **verification**   | QedspecContract, KaniHarness, ProptestStrategy, LeanProof, CrucibleFuzz                                   |

## Quick Start

### Install dependencies

```bash
pnpm install
pnpm --filter @solana-ontology/core build
```

### Parse an Anchor IDL

```bash
# Codemod only (v0 → v1)
pnpm --filter @solana-ontology/cli start -- idl ./idl.json --codemod-only

# Full concept generation
pnpm --filter @solana-ontology/cli start -- idl ./idl.json --out ./ontology/concepts
```

### Validate the ontology

```bash
pnpm --filter @solana-ontology/cli start -- validate
```

### List all concepts

```bash
pnpm --filter @solana-ontology/cli start -- list
```

### Generate TypeScript SDK code

```bash
pnpm --filter @solana-ontology/cli start -- generate ts
```

### Generate Rust stubs

```bash
pnpm --filter @solana-ontology/cli start -- generate rust
```

### Output relationship graph (Mermaid)

```bash
pnpm --filter @solana-ontology/cli start -- graph
```

### Start the OMS Server

```typescript
import { OntologyOmsServer } from "@solana-ontology/oms";
import { loadConcepts } from "@solana-ontology/core";

const server = new OntologyOmsServer({ port: 3000 });
const concepts = loadConcepts("./ontology/concepts", "./ontology");
await server.registerConcepts(concepts);
await server.start();
// REST API at http://localhost:3000/api/v1/
```

### Start the MCP Server

```typescript
import { OntologyMcpServer } from "@solana-ontology/mcp-server";
import { loadConcepts } from "@solana-ontology/core";

const mcp = new OntologyMcpServer({ transport: "stdio" });
const concepts = loadConcepts("./ontology/concepts", "./ontology");
mcp.registerConcepts(concepts);
// MCP resources and tools now available to LLM agents
```

### Use the Kinetic Action Layer

```typescript
import { ActionBuilder, TransactionLifecycle, KeypairSigner } from "@solana-ontology/sdk";

const signer = new KeypairSigner(keypair);
const lifecycle = new TransactionLifecycle({
  connection,
  signer,
  feePayer: signer.getPublicKey(),
});

const builder = new ActionBuilder().setComputeUnits(200_000).setComputeUnitPrice(1000);

const result = await lifecycle.execute(builder);
// build → simulate → sign → dispatch → confirm
```

## Using the Runtime SDK

```typescript
import { OntologyClient, ActionBuilder, derivePda } from "@solana-ontology/sdk";

const client = new OntologyClient({
  rpcUrl: "https://api.devnet.solana.com",
  cluster: "devnet",
});

// Initialize with web3.js fallback
await client.initWeb3();

// Derive a PDA (tries Kit first, falls back to web3.js)
const { address, bump } = await derivePda(programId, [seedBytes]);
```

## Defining a New Concept

Create a YAML file under `ontology/concepts/<category>/`:

```yaml
canonicalName: MyConcept
aliases:
  - my-concept
purpose: "Describe what this concept represents"
category: defi
version: "1.0.0"
owner: team-name
properties:
  - name: amount
    type: u64
    required: true
    description: "The amount stored"
relationships:
  - type: ownedBy
    target: Program
    cardinality: "1:1"
stateMachine:
  states: [Idle, Active]
  transitions:
    - from: Idle
      to: Active
      via: Activate
constraints:
  - name: max-amount
    expression: "amount <= 1000000000"
links:
  - label: Docs
    url: https://docs.example.com
```

## Security Layer

The SDK includes a security validation framework based on [Neodyme's Solana Security Workshop](https://workshop.neodyme.io/index.html) and [Common Pitfalls](https://neodyme.io/en/blog/solana_common_pitfalls/) blog series.

### Security Validation Rules

The validator produces **warnings** (not errors) for concepts that exhibit vulnerability patterns:

| Rule | Severity | Trigger |
|------|----------|---------|
| `missing_auth` | CRITICAL | State transitions without `requiredAuth` |
| `missing_program_id` | HIGH | `accountLayout` without `programId` |
| `untyped_pda_seeds` | MEDIUM | PDA seeds with no `publicKey` type |
| `missing_token_standard` | MEDIUM | Token concept without `tokenStandard` |
| `open_transition` | HIGH | Transition without `requires` or `requiresAuth` |

### PoC Environment

Write exploit tests against your concepts using `PoCEnvironment`, a TypeScript mirror of Neodyme's [`poc_framework::Environment`](https://docs.rs/poc-framework/0.1.2/poc_framework/trait.Environment.html) trait:

```typescript
import { PoCEnvironment, type IPoCEnvironment } from "@solana-ontology/sdk";

const env: IPoCEnvironment = new PoCEnvironment({
  rpcUrl: "http://localhost:8899",
  payer: keypair,
});

// Create token infrastructure
await env.createTokenMint(mintKp, authority, null, 6);
await env.createTokenAccount(tokenAcctKp, mintPubkey);
await env.mintTokens(mintPubkey, authority, tokenAcct, 1_000_000);

// Execute exploit: call without signer
const result = await env.executeAsTransaction([{
  programId: targetProgram,
  accounts: [{ pubkey: attacker, isSigner: false, isWritable: true }],
  data: new Uint8Array(0),
}]);
expect(result.success).toBe(false); // should reject
```
### Auto-Generated PoC Test Scaffolds

Generate exploit test files for all 7 security vulnerability patterns:

```typescript
import { generateAllPoCTestScaffolds } from "@solana-ontology/generator-ts";
import { loadConcepts } from "@solana-ontology/core";

const concepts = loadConcepts("./ontology/concepts", "./ontology");
const scaffolds = generateAllPoCTestScaffolds(concepts);
// → 7 .test.ts files with exploit scenarios using PoCEnvironment
```

Each scaffold includes:
- `beforeAll` setup with `PoCEnvironment` + airdrop
- Exploit-specific test cases (e.g., unsigned authority, fake account, overflow amount)
- Assertions that the program rejects the attack

### Guard Code Generation

Auto-generate Rust guard snippets from concept security fields:

```typescript
import { generateGuardCode } from "@solana-ontology/generator-ts";

const guard = generateGuardCode(concept);
// → Rust code checking is_signer, account owner, transition preconditions
```

## Fuzzing with Trident

Integration with [Trident](https://github.com/Ackee-Blockchain/trident) — a Rust-based, manually-guided fuzzing framework for Solana programs (12,000 tx/s, stateful fuzzing, SVM execution).

### Fuzzing Concepts

Three ontology concepts define fuzz campaigns:

| Concept | Purpose |
|---------|---------|
| `FuzzStrategy` | Target program, instruction list, iteration count, flow weights |
| `FuzzFlow` | Ordered instruction sequences with preconditions and postconditions |
| `FuzzInvariant` | State properties checked after every transaction (derived from constraints) |

### Generate Trident Fuzz Tests

Auto-generate Rust fuzz test files (`#[init]`, `#[flow]`, `#[invariant]`) from any concept with a stateMachine:

```typescript
import { generateAllTridentFuzzTests, generateTridentConfig } from "@solana-ontology/generator-ts";
import { loadConcepts } from "@solana-ontology/core";

const concepts = loadConcepts("./ontology/concepts", "./ontology");

// Generate .rs fuzz test files for all concepts with stateMachine
const fuzzTests = generateAllTridentFuzzTests(concepts);
// → { filename: "vault_fuzz.rs", content: "#[init] fn start() ..." }

// Generate Trident.toml config
const config = generateTridentConfig(concepts.find(c => c.canonicalName === "Vault")!);
```

Each generated fuzz test includes:
- `#[init]` — setup function with initial instruction execution
- `#[flow]` per state transition — randomized instruction execution with signer randomization
- `#[invariant]` per constraint — state property checks after every transaction
- Transaction builder structs with TODO comments for fuzzed input generation

### Run with Trident CLI

```bash
cargo install trident-cli
trident fuzz run vault_fuzz
```

## Real-World Program Examples

Integration with [Solana Foundation program-examples](https://github.com/solana-foundation/program-examples) — 5 real-world programs modeled as ontology concepts with full exploit test generation.

### Modeled Programs

| Program | Category | Source | Exploit Tests |
|---------|----------|--------|---------------|
| **Escrow** | defi | [tokens/escrow](https://github.com/solana-foundation/program-examples/tree/main/tokens/escrow) | Non-maker refund, wrong taker mint, double Take |
| **AMM** | defi | [tokens/token-swap](https://github.com/solana-foundation/program-examples/tree/main/tokens/token-swap) | Constant product violation, token confusion, reserve overflow |
| **Fundraiser** | defi | [tokens/token-fundraiser](https://github.com/solana-foundation/program-examples/tree/main/tokens/token-fundraiser) | Non-creator close, past deadline, overflow contribution |
| **TransferHook** | token | [tokens/token-2022/transfer-hook](https://github.com/solana-foundation/program-examples/tree/main/tokens/token-2022/transfer-hook) | Block list bypass, non-authority pause |
| **Counter** | primitive | [basics/counter](https://github.com/solana-foundation/program-examples/tree/main/basics/counter) | Non-authority increment, overflow, fake PDA |
| **ValidatorGovernance** | governance | [svmgov/program](https://github.com/solana-foundation/solana-governance/tree/main/svmgov/program) | Non-proposer finalize, fake merkle proof, vote overflow |
| **NcnBallot** | governance | [ncn](https://github.com/solana-foundation/solana-governance/tree/main/ncn) | Non-operator close, ballot after deadline |
| **MerkleProofVerifier** | governance | [svmgov/program](https://github.com/solana-foundation/solana-governance) | Invalid merkle proof, non-authority freeze |
| **PaymentChallenge** | defi | [pay-kit (x402)](https://github.com/solana-foundation/pay-kit) | Nonce replay, wrong amount, expired challenge |
| **MultiPartyPayment** | defi | [pay-kit (MPP)](https://github.com/solana-foundation/pay-kit) | Split mismatch, non-fee-payer settle |
| **PaymentSettlement** | defi | [pay-kit](https://github.com/solana-foundation/pay-kit) | Fake tx signature, double receipt |
| **SignerAuthorization** | security | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks) | Missing signer, impersonated authority |
| **AccountDataMatching** | security | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks) | Fake token account, arbitrary account read |
| **TypeCosplay** | security | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks) | Wrong type with matching discriminator, struct reinterpretation |
| **PdaSharing** | security | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks) | PDA collision, vault drain |
| **BumpSeedCanonicalization** | security | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks) | Non-canonical bump, alternative PDA |
| **ClosingAccounts** | security | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks) | Close without clearing data, reinit after close |
| **CoralMultisig** | governance | [coral-xyz/multisig](https://github.com/coral-xyz/multisig) | Below-threshold execution, stale owner set, double execute |
| **MultisigTransaction** | governance | [coral-xyz/multisig](https://github.com/coral-xyz/multisig) | Non-owner approval, approve after execution |
| **TicTacToeGame** | primitive | [coral-xyz/anchor-book](https://github.com/coral-xyz/anchor-book) | Out-of-turn move, tile already set, move after game over |
| **TicTacToePlay** | primitive | [coral-xyz/anchor-book](https://github.com/coral-xyz/anchor-book) | Tile out of bounds, non-participant move |
| **LightProtocolRegistry** | infrastructure | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol) | Unauthorized config update, double forester registration, insufficient funds |
| **AccountCompressionTree** | infrastructure | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol) | Invalid Merkle proof, write to rolled-over tree, batch limit exceeded |
| **CompressedToken** | token | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol) | Sum check bypass, frozen account transfer |
| **LightSystemInvoke** | infrastructure | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol) | Signer check bypass, CPI context hijack |

### Generate Real-World Exploit Tests

```typescript
import { generateAllRealWorldPoCTests } from "@solana-ontology/generator-ts";
import { loadConcepts } from "@solana-ontology/core";

const concepts = loadConcepts("./ontology/concepts", "./ontology");
const tests = generateAllRealWorldPoCTests(concepts);
// → 25 .test.ts files with 61 total exploit scenarios using PoCEnvironment
```

Each concept includes:
- Full `stateMachine` with real transitions (e.g., Escrow: Uninitialized → Initialized → Funded → Completed/Cancelled)
- `accountLayout` with Borsh field offsets matching real on-chain data
- `pdaSeeds` for type-safe PDA derivation
- `constraints` derived from actual program invariants (e.g., constant product for AMM)
- `requiredAuth` and `requireOwnerCheck` security fields
- Links to the original source code in program-examples

## Testing

```bash
pnpm test
```

## Deployment

```bash
# Devnet
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-devnet.yaml

# Testnet
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-testnet.yaml

# Mainnet
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-mainnet.yaml
```

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript 5.4+ (ESM)
- **Validation**: Ajv + JSON Schema
- **Testing**: Vitest
- **Solana SDKs**: `@solana/kit` v7+ (primary), `@solana/web3.js` v1 (adapter)
- **CLI**: Commander.js
- **OMS**: Node.js built-in HTTP (no Express dependency)
- **MCP**: JSON-RPC 2.0 over stdio/HTTP
- **Ingestion**: Yellowstone gRPC (interface-based, pluggable)
- **Deploy**: Helm + Kubernetes

## Independence Statement

This ontology SDK is **fully independent** and does not depend on:

- Palantir Foundry or any external ontology platform
- Any proprietary metadata service
- Any external database (in-memory storage by default)

The OMS is a standalone REST API built with Node.js's built-in HTTP module. External adapters (webhook, Kafka) are optional plugins.

## License

Apache 2.0
