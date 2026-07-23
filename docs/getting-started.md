# Getting Started with Solana Ontology SDK

## Installation

```bash
pnpm add @solana-ontology/core @solana-ontology/sdk @solana-ontology/cli
```

## Quick Start

### 1. Parse an Anchor IDL

```typescript
import { generateConceptsFromIdl, isIdlV0, migrateIdlV0ToV1 } from "@solana-ontology/idl-parser";

const idl = JSON.parse(fs.readFileSync("idl.json", "utf-8"));

// Migrate v0 IDLs to v1 if needed
const idlV1 = isIdlV0(idl) ? migrateIdlV0ToV1(idl) : idl;

// Generate concepts from IDL
const concepts = generateConceptsFromIdl(idlV1);
```

### 2. Validate Concepts

```typescript
import { validateAll } from "@solana-ontology/core";

const result = validateAll(concepts);
if (!result.valid) {
  console.error("Validation errors:", result.errors);
  process.exit(1);
}
```

### 3. Build and Send a Transaction

```typescript
import { ActionBuilder, TransactionLifecycle, KeypairSigner } from "@solana-ontology/sdk";

const signer = new KeypairSigner(keypair);
const lifecycle = new TransactionLifecycle({
  connection: connection,
  signer: signer,
  commitment: "confirmed",
});

const builder = new ActionBuilder()
  .setComputeUnitLimit(200_000)
  .setComputeUnitPrice(1_000)
  .addInstruction(transferInstruction);

const result = await lifecycle.execute(builder);
console.log("Signature:", result.signature);
```

### 4. Derive a PDA from a Concept

```typescript
import { derivePdaFromConcept } from "@solana-ontology/sdk";

const pda = await derivePdaFromConcept(
  tokenMintConcept,
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  { mint: "SomeMintAddress", authority: walletPublicKey }
);
console.log("PDA:", pda.address, "bump:", pda.bump);
```

### 5. Start the OMS Server

```bash
solana-ontology oms --port 3000 --storage memory
```

### 6. Start the MCP Server

```bash
# stdio mode (for local LLM tools)
solana-ontology mcp --transport stdio

# HTTP mode (for remote access)
solana-ontology mcp --transport http --port 3001
```

### 7. Generate a Client Library

```bash
solana-ontology generate-client --output ./src/generated
```

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design
- Browse [ontology/concepts/](../ontology/concepts/) for seed concept examples
- Check the [CHANGELOG.md](../CHANGELOG.md) for recent changes
- See [CONTRIBUTING.md](../CONTRIBUTING.md) to contribute
