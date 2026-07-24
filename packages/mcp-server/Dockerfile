# MCP service image.
#
# The MCP server is started via the CLI (`solana-ontology mcp`), which loads +
# validates the ontology and serves JSON-RPC over stdio or HTTP. We bundle the
# CLI with its production dependencies (core, sdk, mcp-server, and injected
# workspace packages) using `pnpm deploy`, then run it on a slim Node 22 runtime.
#
# Build context is the repo root:  docker build -f packages/mcp-server/Dockerfile .
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY ontology ./ontology
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @solana-ontology/cli --prod --legacy deploy /prod/cli

FROM node:22-slim
WORKDIR /app
COPY --from=builder /prod/cli ./
COPY --from=builder /app/ontology ./ontology
ENV ONTOLOGY_PATH=/app/ontology
ENV MCP_TRANSPORT=http
ENV MCP_PORT=3001
EXPOSE 3001
# transport/port/auth are read from MCP_* env (set by the Helm chart).
CMD ["node", "dist/index.js", "mcp"]
