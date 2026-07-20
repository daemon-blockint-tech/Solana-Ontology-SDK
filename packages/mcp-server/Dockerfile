FROM node:20-slim AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY packages/ontology-core packages/ontology-core
COPY packages/mcp-server packages/mcp-server
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @solana-ontology/core build
RUN pnpm --filter @solana-ontology/mcp-server build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/ontology-core/dist ./packages/ontology-core/dist
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/ontology-core/package.json ./packages/ontology-core/package.json
COPY --from=builder /app/packages/mcp-server/package.json ./packages/mcp-server/package.json
COPY ontology ./ontology
EXPOSE 3001
CMD ["node", "packages/mcp-server/dist/index.js"]
