# Contributing to Solana Ontology SDK

## Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/solana-ontology-sdk.git
cd solana-ontology-sdk

# Install dependencies (requires pnpm 9+)
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint all packages
pnpm lint
```

## Project Structure

This is a pnpm monorepo managed by Turborepo:

```
packages/
  ontology-core/     — Core types, loader, validator, JSON schema
  idl-parser/         — Anchor IDL parser + concept generator
  sdk/                — Runtime SDK (transaction lifecycle, signers, PDA, queries)
  generator-ts/       — TypeScript code generator from concepts
  generator-rust/     — Rust code generator from concepts
  generator-client/   — Client library generator
  ontology-oms/       — Ontology Metadata Service (REST API)
  mcp-server/         — MCP server for LLM agent interaction
  ingestion/          — IDL ingestion pipeline
  cli/                — Command-line interface
ontology/
  schema.json         — JSON Schema for concept YAML files
  concepts/           — Seed concept YAML files organized by category
tests/
  integration/        — Cross-package integration tests
```

## Adding a New Concept

1. Create a YAML file in `ontology/concepts/<category>/`
2. Follow the schema in `ontology/schema.json`
3. Run `pnpm validate` to check it passes validation
4. Add tests if the concept has special behavior

## Code Style

- TypeScript with strict mode
- ESM modules (`"type": "module"`)
- Use `import type` for type-only imports
- No unused variables or imports
- All public APIs should have JSDoc comments

## Pull Request Process

1. Create a feature branch from `main`
2. Ensure `pnpm build && pnpm test && pnpm lint` all pass
3. Write clear commit messages (conventional commits preferred)
4. Update tests for any new functionality
5. Request review from a maintainer

## Testing

- Unit tests use Vitest
- Integration tests are in `tests/integration/`
- Run a single package's tests: `pnpm --filter @solana-ontology/core test`
- Run all tests: `pnpm test`
