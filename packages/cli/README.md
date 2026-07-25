# @solana-ontology/cli

CLI for validating and generating code from the Solana Ontology

Part of the [Solana Ontology SDK](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK) — a system for modeling Solana on-chain data as an ontology of Object, Link, and Action types.

## Installation

```bash
npm install -g @solana-ontology/cli
```

## Usage

The `solana-ontology` binary exposes eight subcommands:

```bash
solana-ontology validate                  # validate all concept YAML against the schema
solana-ontology list --category token     # browse concepts (optional --category filter)
solana-ontology graph                      # emit the concept graph as a Mermaid diagram
solana-ontology idl ./idl.json --out ./ontology/concepts   # Anchor IDL → concepts
solana-ontology generate ts --out ./gen    # codegen typed TypeScript (or `rust`)
solana-ontology generate-client --react --out ./client     # full typed client library
solana-ontology oms --port 3000            # start the REST metadata service
solana-ontology mcp --transport stdio      # start the MCP server for LLM agents
```

Most commands accept `--path <dir>` to point at a custom ontology root.

## Documentation

See the [monorepo README](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK#readme) for architecture, concepts, and usage across all `@solana-ontology/*` packages.

## License

Apache-2.0
