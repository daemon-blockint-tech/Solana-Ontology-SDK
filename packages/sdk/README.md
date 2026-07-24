# @solana-ontology/sdk

Runtime SDK for the Solana Ontology with @solana/kit and web3.js v1 adapter

Part of the [Solana Ontology SDK](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK) — a system for modeling Solana on-chain data as an ontology of Object, Link, and Action types.

## Installation

```bash
npm install @solana-ontology/sdk @solana-ontology/core @solana/web3.js
```

`@solana/kit` is an optional peer dependency — install it only for the Kit-based client path.

## Usage

```typescript
import {
  OntologyClient,
  fetchAccount,
  derivePdaFromConcept,
  ActionBuilder,
  TransactionLifecycle,
  KeypairSigner,
} from "@solana-ontology/sdk";
import { loadConcepts } from "@solana-ontology/core";

const client = new OntologyClient({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  commitment: "confirmed",
});
client.registerConcepts(loadConcepts("./ontology/concepts", "./ontology"));

// Derive a PDA from a concept's declared seeds
const { address, bump } = derivePdaFromConcept(client.getConcept("TokenMint")!, {
  /* seed values */
});

// web3.js Connection is fully typed (no casting)
await client.initWeb3();
const connection = client.getWeb3Connection();
const account = await fetchAccount(client, address, decoder);
```

### Kinetic Action Layer

```typescript
const signer = new KeypairSigner(keypair);
const lifecycle = new TransactionLifecycle({ connection, signer, feePayer: signer.getPublicKey() });
const builder = new ActionBuilder().setComputeUnits(200_000).setComputeUnitPrice(1000);
const result = await lifecycle.execute(builder); // build → simulate → sign → dispatch → confirm
```

## Documentation

See the [monorepo README](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK#readme) for architecture, concepts, and usage across all `@solana-ontology/*` packages.

## License

Apache-2.0
