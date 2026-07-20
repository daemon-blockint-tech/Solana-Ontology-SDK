FROM node:20-slim AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY packages/ontology-core packages/ontology-core
COPY packages/ingestion packages/ingestion
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @solana-ontology/core build
RUN pnpm --filter @solana-ontology/ingestion build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/ontology-core/dist ./packages/ontology-core/dist
COPY --from=builder /app/packages/ingestion/dist ./packages/ingestion/dist
COPY --from=builder /app/packages/ontology-core/package.json ./packages/ontology-core/package.json
COPY --from=builder /app/packages/ingestion/package.json ./packages/ingestion/package.json
CMD ["node", "packages/ingestion/dist/index.js"]
