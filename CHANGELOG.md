# Changelog

All notable changes to the Solana Ontology SDK will be documented in this file.

## [0.1.0] - Unreleased

### Added
- Initial release of the Solana Ontology SDK
- 34 seed concept YAML definitions across 6 categories: primitives, tokens, defi, governance, infrastructure, delivery
- Core ontology library: types, loader, validator, graph builder (`@solana-ontology/core`)
- Runtime SDK with `@solana/kit` v7 support and `@solana/web3.js` v1 adapter (`@solana-ontology/sdk`)
- Kinetic Action Layer: ActionBuilder, TransactionLifecycle, signers, Borsh encoding
- Anchor IDL parser with v0→v1 codemod and concept generator (`@solana-ontology/idl-parser`)
- Yellowstone gRPC ingestion client with state management and reorg handling (`@solana-ontology/ingestion`)
- Independent Ontology Metadata Service (OMS) with REST API and pluggable storage (`@solana-ontology/oms`)
- MCP server exposing ontology concepts as LLM-callable resources and tools (`@solana-ontology/mcp-server`)
- TypeScript code generator producing typed interfaces, decoders, actions, and queries (`@solana-ontology/generator-ts`)
- Rust code generator stub (`@solana-ontology/generator-rust`)
- Typed React/TypeScript client library generator (`@solana-ontology/generator-client`)
- CLI with commands: validate, generate, list, graph, idl, oms, mcp, generate-client (`@solana-ontology/cli`)
- Helm deployment charts for devnet, testnet, and mainnet (`@solana-ontology/deploy`)
- Docker Compose setup for local development

[0.1.0]: https://github.com/daemon-blockint-tech/Solana-Ontology-SDK/releases/tag/v0.1.0
