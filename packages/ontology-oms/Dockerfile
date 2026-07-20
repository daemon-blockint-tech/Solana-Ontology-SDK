FROM node:20-slim AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json ./
COPY packages/ontology-core packages/ontology-core
COPY packages/ontology-oms packages/ontology-oms
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @solana-ontology/core build
RUN pnpm --filter @solana-ontology/oms build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/ontology-core/dist ./packages/ontology-core/dist
COPY --from=builder /app/packages/ontology-oms/dist ./packages/ontology-oms/dist
COPY --from=builder /app/packages/ontology-core/package.json ./packages/ontology-core/package.json
COPY --from=builder /app/packages/ontology-oms/package.json ./packages/ontology-oms/package.json
COPY ontology ./ontology
EXPOSE 3000
CMD ["node", "packages/ontology-oms/dist/index.js"]
