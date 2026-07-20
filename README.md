# Solana Ontology SDK

> Solana Data-Logic-Action by using Ontology System

A concept-centric SDK for building Solana applications inspired by Palantir's ontology-driven development approach. Define your on-chain concepts as YAML, validate them against a JSON Schema, generate typed SDK code, and interact with them at runtime using `@solana/kit` or `web3.js`.

## Architecture

```
ontology/                    YAML concept definitions + JSON Schema
packages/
  ontology-core/             Types, loader, validator, graph builder
  generator-ts/              TypeScript code generator (interfaces, decoders, actions, queries)
  generator-rust/            Rust code generator stub (structs, PDA helpers)
  sdk/                       Runtime SDK (Kit client + web3.js adapter)
  cli/                       solana-ontology CLI (validate, generate, list, graph)
```

## Concept Categories

| Category | Concepts |
|---|---|
| **primitive** | Account, Program, Transaction, Instruction, PDA, Signer, ComputeBudget, Rent |
| **token** | TokenMint, TokenAccount, TokenExtension, NFT, Collection, Metadata |
| **defi** | LiquidityPool, Position, Vault, OracleFeed, LendingMarket, SwapRoute |
| **governance** | Proposal, Vote, Multisig, DAO, StakeAccount |
| **infrastructure** | Cluster, Slot, Epoch, Validator |
| **delivery** | ProgramRelease, ReleaseChannel, Environment, UpgradeAuthority, DeploymentConstraint |

## Quick Start

### Install dependencies

```bash
pnpm install
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

## Testing

```bash
pnpm test
```

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript 5.4+ (ESM)
- **Validation**: Ajv + JSON Schema
- **Testing**: Vitest
- **Solana SDKs**: `@solana/kit` v7+ (primary), `@solana/web3.js` v1 (adapter)
- **CLI**: Commander.js

## License

MIT
