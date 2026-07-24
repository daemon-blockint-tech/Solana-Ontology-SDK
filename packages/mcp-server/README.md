# @solana-ontology/mcp-server

MCP server exposing the independent Solana Ontology as LLM-callable tools

Part of the [Solana Ontology SDK](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK) — a system for modeling Solana on-chain data as an ontology of Object, Link, and Action types.

## Installation

```bash
npm install @solana-ontology/mcp-server @solana-ontology/core
```

## Usage

Exposes the ontology to LLM agents as MCP resources (one per concept) and tools
(derived from concept state machines; destructive actions are gated behind approval).

```typescript
import { OntologyMcpServer } from "@solana-ontology/mcp-server";
import { loadConcepts } from "@solana-ontology/core";

const mcp = new OntologyMcpServer({ transport: "stdio" });
mcp.registerConcepts(loadConcepts("./ontology/concepts", "./ontology"));

mcp.listResources(); // solana-ontology://concept/<Name>
mcp.listTools(); // state-machine transitions as callable tools
```

Or start it straight from the CLI and wire it into an agent's MCP config:

```bash
solana-ontology mcp --transport stdio          # local agents
solana-ontology mcp --transport http --port 3001 --auth-required   # networked
```

## Documentation

See the [monorepo README](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK#readme) for architecture, concepts, and usage across all `@solana-ontology/*` packages.

## License

Apache-2.0
