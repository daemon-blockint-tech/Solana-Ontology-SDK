# @solana-ontology/oms

Independent Ontology Metadata Service — REST API for managing Object Types, Link Types, and Action Types

Part of the [Solana Ontology SDK](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK) — a system for modeling Solana on-chain data as an ontology of Object, Link, and Action types.

## Installation

```bash
npm install @solana-ontology/oms @solana-ontology/core
```

## Usage

```typescript
import { OntologyOmsServer, SqliteStorage } from "@solana-ontology/oms";
import { loadConcepts } from "@solana-ontology/core";

// In-memory (default) — good for a single process / tests
const oms = new OntologyOmsServer({ port: 3000 });

// Or durable SQLite (Node's built-in node:sqlite, no native deps)
// const oms = await OntologyOmsServer.create({ port: 3000, storage: "sqlite", dbPath: "./oms.db" });

await oms.registerConcepts(loadConcepts("./ontology/concepts", "./ontology"));
await oms.start();
// REST API at http://localhost:3000/api/v1/ (Object / Link / Action types)
```

> **Hosting note:** the default `memory` storage is per-process — do not run multiple
> replicas against it. For a shared/hosted deployment use `SqliteStorage` on a persistent
> volume (single writer) or a shared database behind the `OmsStorage` interface.

## Documentation

See the [monorepo README](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK#readme) for architecture, concepts, and usage across all `@solana-ontology/*` packages.

## License

Apache-2.0
