# Solana Ontology SDK — Architecture

The Solana Ontology SDK is an **independent** semantic abstraction layer for Solana blockchain development. It bridges the gap between raw on-chain primitives (accounts, programs, instructions) and higher-level application development by providing a concept-driven ontology system with code generation, runtime SDK, metadata services, and LLM agent integration.

> **Note:** The Geyser/Yellowstone ingestion, MCP server, and OMS are **extension layers** built on top of core Solana primitives. They are not part of the Solana protocol itself — they are value-added services provided by this SDK.

## Package Overview

| Package | Purpose |
|---------|---------|
| `@solana-ontology/core` | Core types, YAML loader, JSON Schema validator, graph builder, program ID registry |
| `@solana-ontology/idl-parser` | Anchor IDL v0/v1 parser, codemod, concept generator from IDL |
| `@solana-ontology/sdk` | Runtime SDK: transaction lifecycle, signers, PDA derivation, queries, account fetching |
| `@solana-ontology/generator-ts` | TypeScript code generator from concepts (interfaces, decoders, PDA helpers, actions, CPI) |
| `@solana-ontology/generator-rust` | Rust code generator from concepts |
| `@solana-ontology/generator-client` | Client library generator (React hooks, queries, API client) |
| `@solana-ontology/oms` | Ontology Metadata Service — REST API for Object/Link/Action Types |
| `@solana-ontology/mcp-server` | MCP server exposing ontology as resources/tools for LLM agents |
| `@solana-ontology/ingestion` | IDL ingestion pipeline (file watcher + auto-import) |
| `@solana-ontology/cli` | Command-line interface for all operations |

## Data Flow

```
Anchor IDL (JSON)
    │
    ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  idl-parser     │────▶│  ontology-core   │────▶│   validator     │
│  (parse+gen)    │     │  (Concept YAML)  │     │   (schema+sem.)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │ valid
                                                          ▼
                        ┌─────────────────────────────────┐
                        │           Consumer Paths         │
                        ├──────────┬──────────┬───────────┤
                        ▼          ▼          ▼           ▼
                   generator-ts  generator-  ontology-   mcp-server
                   (types+code)  client      oms         (LLM agent)
                        │          │          │           │
                        ▼          ▼          ▼           ▼
                   SDK runtime   React app  REST API   JSON-RPC
```

## Concept Schema

Each concept is a YAML file describing a Solana domain entity:

- **Properties**: typed data fields (u8, u64, Address, bool, etc.)
- **Relationships**: ownedBy, derivedFrom, cpiTo, contains, references, extends
- **State Machine**: states + transitions (becomes Action Types in OMS)
- **On-Chain Linkage** (new):
  - `programId`: default on-chain program (base58)
  - `accountLayout`: Borsh field layout with discriminator
  - `pdaSeeds`: formal seed structure for type-safe PDA derivation
  - `idlInstruction`: link to IDL instruction name + discriminator
  - `tokenStandard`: `"spl"` or `"token2022"` for token concepts

## Kinetic Layer (Transaction Lifecycle)

```
ActionBuilder.build() → instructions[]
    │
    ▼
TransactionLifecycle.execute()
    │
    ├─ 1. Fetch blockhash (cached)
    ├─ 2. Simulate (optional)
    │     └─ auto-adjust CU limit from unitsConsumed × 1.2
    ├─ 3. Sign (KeypairSigner / KmsSigner / MpcSigner)
    ├─ 4. Dispatch (sendRawTransaction)
    └─ 5. Confirm (poll until confirmed/finalized)
```

## Extension Layers

The following are **not** part of core Solana — they are SDK-provided extensions:

- **OMS** (Ontology Metadata Service): REST API for managing type registries
- **MCP Server**: JSON-RPC server for LLM agent interaction with ontology
- **Geyser Ingestion**: Real-time account updates via Yellowstone gRPC (optional)
