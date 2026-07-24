# @solana-ontology/deploy

Helm chart + Kubernetes manifests for self-hosting the Solana Ontology services.
This package is **not published to npm** — it's infrastructure config consumed by
`helm`, not a library.

Part of the [Solana Ontology SDK](https://github.com/daemon-blockint-tech/Solana-Ontology-SDK).

## What this deploys

| Service       | Image                 | Entry                         | Hostable?         |
| ------------- | --------------------- | ----------------------------- | ----------------- |
| **OMS**       | `solana-ontology-oms` | CLI `oms` (REST on :3000)     | ✅ yes            |
| **MCP**       | `solana-ontology-mcp` | CLI `mcp` (JSON-RPC on :3001) | ✅ yes            |
| **Ingestion** | _none_                | —                             | ❌ no (see below) |

Both service images bundle the `@solana-ontology/cli` (which is the real
long-running entrypoint — `solana-ontology oms` / `mcp`) together with its
production dependencies via `pnpm deploy`, on a Node 22 runtime. Configuration is
read from environment variables that the chart sets (`OMS_*`, `MCP_*`).

## Images

The two images are built and pushed by `.github/workflows/docker.yml` on `v*`
tags (and `main`) to:

```
ghcr.io/<org>/solana-ontology-oms:<tag>
ghcr.io/<org>/solana-ontology-mcp:<tag>
```

`values.yaml` `image.repository` must include the GHCR owner segment so the
rendered ref (`{registry}/{repository}-<svc>:{tag}`) is pullable.

To build locally (context is the repo root):

```bash
docker build -f packages/ontology-oms/Dockerfile -t solana-ontology-oms .
docker build -f packages/mcp-server/Dockerfile   -t solana-ontology-mcp .
```

## Install

```bash
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-devnet.yaml
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-testnet.yaml
helm install solana-ontology ./packages/deploy -f ./packages/deploy/values-mainnet.yaml
```

Render/validate without a cluster:

```bash
helm lint ./packages/deploy
helm template solana-ontology ./packages/deploy -f ./packages/deploy/values-mainnet.yaml
```

## OMS storage & replicas (important)

The OMS has two storage backends:

- **`memory`** — per-process, lost on restart. Fine for dev/tests.
- **`sqlite`** — persistent (Node's built-in `node:sqlite`), single writer. This
  is the default for hosting; the chart mounts a PVC at `/data` so the DB
  survives restarts.

There is **no shared backend**, so the OMS must run as a **single replica**
(`oms.replicas: 1`). Multiple replicas would each hold independent state and
diverge. `storage: "postgres"` is **not implemented** — the CLI rejects it rather
than silently falling back to memory. Horizontal scale-out requires implementing
a shared store behind the `OmsStorage` interface (`packages/ontology-oms/src/storage/interface.ts`).

## Ingestion is not hostable out of the box

`@solana-ontology/ingestion` is a library of **injectable stubs** — the
Yellowstone gRPC client and Kafka producer have no transport of their own and no
standalone server entrypoint. There is therefore **no ingestion image**, and
`ingestion.enabled` defaults to `false`. To run ingestion you must supply your
own entrypoint + image that injects a real Yellowstone gRPC transport (a Geyser
validator or a provider such as Triton/Helius) and, optionally, a Kafka client.

## Secrets

`templates/secrets.yaml` renders from `.Values.secrets`, which default to empty.
**Do not commit real credentials.** For production, leave the values empty and
manage a Secret named `<release>-secrets` out-of-band with an external secret
manager (External Secrets Operator, sealed-secrets, or a cloud secret store),
with keys: `rpcApiKey`, `kmsKeyId`, `mpcWebhookToken`, `omsAuthToken`.

## Full hosting footprint

| Requirement                                 | Needed by            | Notes                                           |
| ------------------------------------------- | -------------------- | ----------------------------------------------- |
| Kubernetes cluster + Helm                   | all                  |                                                 |
| GHCR (or registry) with the 2 images pushed | OMS, MCP             | via `docker.yml` on a `v*` tag                  |
| PVC / default StorageClass                  | OMS (sqlite)         | `oms.persistence`                               |
| RPC provider + `rpcApiKey`                  | ingestion, signers   | operator-supplied secret                        |
| Yellowstone gRPC endpoint                   | ingestion            | heavy external dep; only if you build ingestion |
| Kafka cluster + injected client             | ingestion (optional) | only if using `KafkaProducer`                   |
| MCP auth (`mcp.authRequired: true`)         | MCP (http)           | on by default in mainnet values                 |
