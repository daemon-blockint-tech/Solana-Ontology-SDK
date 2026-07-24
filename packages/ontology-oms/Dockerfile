# OMS service image.
#
# The long-running OMS server is started via the CLI (`solana-ontology oms`),
# which loads + validates the ontology and calls server.start(). We bundle the
# CLI together with its production dependencies (core, oms, and the injected
# workspace packages) using `pnpm deploy`, then run it on a slim Node 22 runtime.
# Node 22 is required — pnpm 11 and the SQLite backend both use node:sqlite.
#
# Build context is the repo root:  docker build -f packages/ontology-oms/Dockerfile .
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY ontology ./ontology
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @solana-ontology/cli --prod deploy /prod/cli

FROM node:22-slim
WORKDIR /app
COPY --from=builder /prod/cli ./
COPY --from=builder /app/ontology ./ontology
ENV ONTOLOGY_PATH=/app/ontology
ENV OMS_PORT=3000
ENV OMS_STORAGE=memory
EXPOSE 3000
# storage/port/auth/db-path are read from OMS_* env (set by the Helm chart).
CMD ["node", "dist/index.js", "oms"]
