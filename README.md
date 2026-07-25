<p align="center">
  <img src="docs/solana-icon.png" alt="Solana" width="48" height="48" />
</p>

# Solana Ontology SDK

> Independent Semantic Ontology Layer for Solana Programs

<p align="center">
  <a href="https://www.npmjs.com/package/@solana-ontology/sdk"><img alt="npm version" src="https://img.shields.io/npm/v/@solana-ontology/sdk?label=%40solana-ontology%2Fsdk&color=cb3837&logo=npm" /></a>
  <a href="https://www.npmjs.com/package/@solana-ontology/cli"><img alt="cli version" src="https://img.shields.io/npm/v/@solana-ontology/cli?label=cli&color=cb3837&logo=npm" /></a>
  <a href="https://www.npmjs.com/org/solana-ontology"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@solana-ontology/core?label=downloads&color=blue" /></a>
  <a href="https://github.com/daemon-blockint-tech/Solana-Ontology-SDK/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/daemon-blockint-tech/Solana-Ontology-SDK/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="#license"><img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-green" /></a>
  <a href="#contributing--monorepo-dev"><img alt="node" src="https://img.shields.io/badge/node-%E2%89%A522.13-339933?logo=node.js&logoColor=white" /></a>
</p>

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

All ten library packages are published on npm (public, Apache-2.0). Click a badge to open
the package on npm:

| Package                                                                                                | Version                                                                                                                                                | Description                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [`@solana-ontology/core`](https://www.npmjs.com/package/@solana-ontology/core)                         | [![npm](https://img.shields.io/npm/v/@solana-ontology/core?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/core)                         | Core types, validator, loader, graph builder                             |
| [`@solana-ontology/idl-parser`](https://www.npmjs.com/package/@solana-ontology/idl-parser)             | [![npm](https://img.shields.io/npm/v/@solana-ontology/idl-parser?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/idl-parser)             | Anchor IDL v0/v1 parser + codemod + concept generator                    |
| [`@solana-ontology/sdk`](https://www.npmjs.com/package/@solana-ontology/sdk)                           | [![npm](https://img.shields.io/npm/v/@solana-ontology/sdk?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/sdk)                           | Runtime SDK: ActionBuilder, TransactionLifecycle, signers, Borsh encoder |
| [`@solana-ontology/ingestion`](https://www.npmjs.com/package/@solana-ontology/ingestion)               | [![npm](https://img.shields.io/npm/v/@solana-ontology/ingestion?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/ingestion)               | Yellowstone gRPC client, state manager with reorg handling               |
| [`@solana-ontology/oms`](https://www.npmjs.com/package/@solana-ontology/oms)                           | [![npm](https://img.shields.io/npm/v/@solana-ontology/oms?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/oms)                           | Independent OMS — REST API, registries, pluggable storage                |
| [`@solana-ontology/mcp-server`](https://www.npmjs.com/package/@solana-ontology/mcp-server)             | [![npm](https://img.shields.io/npm/v/@solana-ontology/mcp-server?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/mcp-server)             | MCP server exposing ontology as LLM-callable resources and tools         |
| [`@solana-ontology/generator-client`](https://www.npmjs.com/package/@solana-ontology/generator-client) | [![npm](https://img.shields.io/npm/v/@solana-ontology/generator-client?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/generator-client) | Typed React/TypeScript client library generator                          |
| [`@solana-ontology/generator-ts`](https://www.npmjs.com/package/@solana-ontology/generator-ts)         | [![npm](https://img.shields.io/npm/v/@solana-ontology/generator-ts?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/generator-ts)         | TypeScript code generator                                                |
| [`@solana-ontology/generator-rust`](https://www.npmjs.com/package/@solana-ontology/generator-rust)     | [![npm](https://img.shields.io/npm/v/@solana-ontology/generator-rust?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/generator-rust)     | Rust code generator                                                      |
| [`@solana-ontology/cli`](https://www.npmjs.com/package/@solana-ontology/cli)                           | [![npm](https://img.shields.io/npm/v/@solana-ontology/cli?color=cb3837)](https://www.npmjs.com/package/@solana-ontology/cli)                           | CLI: validate, generate, list, graph, idl                                |
| `@solana-ontology/deploy`                                                                              | —                                                                                                                                                      | Helm chart + K8s configs (devnet/testnet/mainnet) — not published        |

> **Container images.** The OMS and MCP services are also published as containers to GHCR
> (`ghcr.io/daemon-blockint-tech/solana-ontology-{oms,mcp}`) — those are what GitHub lists
> under "Packages" on this repo. The ten npm packages above live on npmjs.com, a separate
> registry that GitHub's Packages panel does not index.

**Every package ships unit tests, plus a cross-package integration suite; run `pnpm test` and `pnpm test:integration` from a checkout.**

## Concept Categories

| Category           | Concepts                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **primitive**      | Account, Program, Transaction, Instruction, PDA, Signer, ComputeBudget, Rent, Counter, TicTacToeGame, TicTacToePlay                                                                                                                                   |
| **token**          | TokenMint, TokenAccount, TokenExtension, NFT, Collection, Metadata, TransferHook, CompressedToken                                                                                                                                                     |
| **defi**           | LiquidityPool, Position, Vault, OracleFeed, LendingMarket, SwapRoute, Escrow, AutomatedMarketMaker, Fundraiser, PaymentChallenge, MultiPartyPayment, PaymentSettlement                                                                                |
| **governance**     | Proposal, Vote, Multisig, DAO, StakeAccount, ValidatorGovernance, NcnBallot, MerkleProofVerifier, CoralMultisig, MultisigTransaction                                                                                                                  |
| **infrastructure** | Cluster, Slot, Epoch, Validator, LightProtocolRegistry, AccountCompressionTree, LightSystemInvoke                                                                                                                                                     |
| **delivery**       | ProgramRelease, ReleaseChannel, Environment, UpgradeAuthority, DeploymentConstraint                                                                                                                                                                   |
| **security**       | MissingSignerCheck, AccountSubstitution, MissingOwnerCheck, SplTokenConfusion, PdaSeedMismatch, IntegerOverflow, ArbitraryCpiInvocation, SignerAuthorization, AccountDataMatching, TypeCosplay, PdaSharing, BumpSeedCanonicalization, ClosingAccounts |
| **fuzzing**        | FuzzStrategy, FuzzFlow, FuzzInvariant                                                                                                                                                                                                                 |
| **verification**   | QedspecContract, KaniHarness, ProptestStrategy, LeanProof, CrucibleFuzz                                                                                                                                                                               |

## Quick Start

### Install from npm

```bash
# The CLI (validate / generate / explore the ontology)
npm install -g @solana-ontology/cli

# Or add the libraries to your app
npm install @solana-ontology/sdk @solana-ontology/core @solana/web3.js
```

`@solana/kit` is an **optional** peer dependency of the SDK — install it only if
you want the Kit-based client path; `@solana/web3.js` alone is sufficient otherwise.

### CLI usage

Once installed globally, the `solana-ontology` binary exposes eight subcommands:

```bash
# Parse an Anchor IDL → ontology concepts
solana-ontology idl ./idl.json --codemod-only            # v0 → v1 only
solana-ontology idl ./idl.json --out ./ontology/concepts  # full concept generation

solana-ontology validate                  # validate all concept YAML against the schema
solana-ontology list --category token     # browse concepts (optionally filter by category)
solana-ontology graph                      # emit the concept graph as a Mermaid diagram
solana-ontology generate ts --out ./gen    # codegen typed TypeScript (or `rust`)
solana-ontology generate-client --react --out ./client  # full typed client library
solana-ontology oms --port 3000            # start the REST metadata service
solana-ontology mcp --transport stdio      # start the MCP server for LLM agents
```

> Working from a checkout of this repo instead of the published packages? See
> [Contributing / monorepo dev](#contributing--monorepo-dev) for the `pnpm --filter` equivalents.

### Fetch and decode with the runtime SDK

```typescript
import { OntologyClient, fetchAccount, derivePdaFromConcept } from "@solana-ontology/sdk";
import { loadConcepts } from "@solana-ontology/core";

const client = new OntologyClient({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  commitment: "confirmed",
});

// Register the concepts you care about (from ontology YAML, OMS, or generated code)
client.registerConcepts(loadConcepts("./ontology/concepts", "./ontology"));

// Derive a PDA straight from a concept's declared seeds
const { address, bump } = derivePdaFromConcept(client.getConcept("TokenMint")!, {
  /* seed values */
});

// getWeb3Connection() is now typed as web3.js `Connection` — no casting needed
await client.initWeb3();
const connection = client.getWeb3Connection();
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

| Rule                     | Severity | Trigger                                         |
| ------------------------ | -------- | ----------------------------------------------- |
| `missing_auth`           | CRITICAL | State transitions without `requiredAuth`        |
| `missing_program_id`     | HIGH     | `accountLayout` without `programId`             |
| `untyped_pda_seeds`      | MEDIUM   | PDA seeds with no `publicKey` type              |
| `missing_token_standard` | MEDIUM   | Token concept without `tokenStandard`           |
| `open_transition`        | HIGH     | Transition without `requires` or `requiresAuth` |

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
const result = await env.executeAsTransaction([
  {
    programId: targetProgram,
    accounts: [{ pubkey: attacker, isSigner: false, isWritable: true }],
    data: new Uint8Array(0),
  },
]);
expect(result.success).toBe(false); // should reject
```

### Auto-Generated PoC Test Scaffolds

Generate exploit test files for the security vulnerability patterns:

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

| Concept         | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `FuzzStrategy`  | Target program, instruction list, iteration count, flow weights             |
| `FuzzFlow`      | Ordered instruction sequences with preconditions and postconditions         |
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
const config = generateTridentConfig(concepts.find((c) => c.canonicalName === "Vault")!);
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

| Program                      | Category       | Source                                                                                                                             | Exploit Tests                                                                |
| ---------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Escrow**                   | defi           | [tokens/escrow](https://github.com/solana-foundation/program-examples/tree/main/tokens/escrow)                                     | Non-maker refund, wrong taker mint, double Take                              |
| **AMM**                      | defi           | [tokens/token-swap](https://github.com/solana-foundation/program-examples/tree/main/tokens/token-swap)                             | Constant product violation, token confusion, reserve overflow                |
| **Fundraiser**               | defi           | [tokens/token-fundraiser](https://github.com/solana-foundation/program-examples/tree/main/tokens/token-fundraiser)                 | Non-creator close, past deadline, overflow contribution                      |
| **TransferHook**             | token          | [tokens/token-2022/transfer-hook](https://github.com/solana-foundation/program-examples/tree/main/tokens/token-2022/transfer-hook) | Block list bypass, non-authority pause                                       |
| **Counter**                  | primitive      | [basics/counter](https://github.com/solana-foundation/program-examples/tree/main/basics/counter)                                   | Non-authority increment, overflow, fake PDA                                  |
| **ValidatorGovernance**      | governance     | [svmgov/program](https://github.com/solana-foundation/solana-governance/tree/main/svmgov/program)                                  | Non-proposer finalize, fake merkle proof, vote overflow                      |
| **NcnBallot**                | governance     | [ncn](https://github.com/solana-foundation/solana-governance/tree/main/ncn)                                                        | Non-operator close, ballot after deadline                                    |
| **MerkleProofVerifier**      | governance     | [svmgov/program](https://github.com/solana-foundation/solana-governance)                                                           | Invalid merkle proof, non-authority freeze                                   |
| **PaymentChallenge**         | defi           | [pay-kit (x402)](https://github.com/solana-foundation/pay-kit)                                                                     | Nonce replay, wrong amount, expired challenge                                |
| **MultiPartyPayment**        | defi           | [pay-kit (MPP)](https://github.com/solana-foundation/pay-kit)                                                                      | Split mismatch, non-fee-payer settle                                         |
| **PaymentSettlement**        | defi           | [pay-kit](https://github.com/solana-foundation/pay-kit)                                                                            | Fake tx signature, double receipt                                            |
| **SignerAuthorization**      | security       | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks)                                                                  | Missing signer, impersonated authority                                       |
| **AccountDataMatching**      | security       | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks)                                                                  | Fake token account, arbitrary account read                                   |
| **TypeCosplay**              | security       | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks)                                                                  | Wrong type with matching discriminator, struct reinterpretation              |
| **PdaSharing**               | security       | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks)                                                                  | PDA collision, vault drain                                                   |
| **BumpSeedCanonicalization** | security       | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks)                                                                  | Non-canonical bump, alternative PDA                                          |
| **ClosingAccounts**          | security       | [sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks)                                                                  | Close without clearing data, reinit after close                              |
| **CoralMultisig**            | governance     | [coral-xyz/multisig](https://github.com/coral-xyz/multisig)                                                                        | Below-threshold execution, stale owner set, double execute                   |
| **MultisigTransaction**      | governance     | [coral-xyz/multisig](https://github.com/coral-xyz/multisig)                                                                        | Non-owner approval, approve after execution                                  |
| **TicTacToeGame**            | primitive      | [coral-xyz/anchor-book](https://github.com/coral-xyz/anchor-book)                                                                  | Out-of-turn move, tile already set, move after game over                     |
| **TicTacToePlay**            | primitive      | [coral-xyz/anchor-book](https://github.com/coral-xyz/anchor-book)                                                                  | Tile out of bounds, non-participant move                                     |
| **LightProtocolRegistry**    | infrastructure | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol)                                                    | Unauthorized config update, double forester registration, insufficient funds |
| **AccountCompressionTree**   | infrastructure | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol)                                                    | Invalid Merkle proof, write to rolled-over tree, batch limit exceeded        |
| **CompressedToken**          | token          | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol)                                                    | Sum check bypass, frozen account transfer                                    |
| **LightSystemInvoke**        | infrastructure | [Lightprotocol/light-protocol](https://github.com/Lightprotocol/light-protocol)                                                    | Signer check bypass, CPI context hijack                                      |

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

Self-host the **OMS** (REST) and **MCP** (JSON-RPC) services on Kubernetes. Both
run the CLI as their entrypoint from images built by `.github/workflows/docker.yml`
and pushed to GHCR. The OMS uses SQLite on a PVC and runs as a single replica
(there is no shared backend); ingestion is a library of injectable stubs with no
standalone image. See [`packages/deploy/README.md`](packages/deploy/README.md) for
the full footprint, storage/replica constraints, secrets handling, and ingestion.

```bash
# Devnet / Testnet / Mainnet
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-devnet.yaml
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-mainnet.yaml

# Render/validate without a cluster
helm lint ./packages/deploy
helm template solana-ontology ./packages/deploy -f ./packages/deploy/values-mainnet.yaml
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

## Contributing / monorepo dev

Working from a checkout rather than the published packages? This is a pnpm 11 + Turborepo
monorepo (Node ≥ 22.13 required — pnpm 11 uses `node:sqlite` internally).

```bash
pnpm install
pnpm build                 # build all packages (turbo, respects the dependency graph)
pnpm lint                  # tsc --noEmit per package
pnpm test                  # unit tests
pnpm test:integration      # cross-package integration suite
pnpm validate              # validate the 78 ontology YAMLs against the schema
pnpm format:check          # prettier
```

Run the in-repo CLI without a global install via the workspace filter, e.g.:

```bash
pnpm --filter @solana-ontology/cli start -- validate
pnpm --filter @solana-ontology/cli start -- idl ./idl.json --out ./ontology/concepts
```

### Cutting a release

Releases are published by **pushing a `vX.Y.Z` tag** — the `release.yml` workflow builds,
tests, and runs `pnpm publish -r` with npm provenance using the `NPM_TOKEN` automation token
stored in GitHub Secrets. No tokens are ever pasted or stored locally.

```bash
# after bumping versions and merging to main
git tag v0.2.0 && git push origin v0.2.0
```

## License

Apache 2.0
