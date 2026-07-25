import { loadConcepts, validateAll } from "@solana-ontology/core";
import { OntologyOmsServer } from "@solana-ontology/oms";
import type { CliConfig } from "../config.js";

export async function omsCommand(
  config: CliConfig,
  opts: { port: number; authToken?: string; storage?: string; dbPath?: string },
): Promise<void> {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  console.log(`Loaded ${concepts.length} concepts`);

  const result = validateAll(concepts);
  if (!result.valid) {
    console.error(`✗ Validation failed with ${result.errors.length} error(s)`);
    process.exit(1);
  }

  const storage = opts.storage ?? "memory";
  if (storage === "postgres") {
    // No Postgres backend is implemented — fail loudly rather than silently
    // falling back to in-memory (which would diverge across replicas).
    console.error(
      "✗ storage=postgres is not implemented. Use 'memory' (single replica) or 'sqlite' (persistent, single writer).",
    );
    process.exit(1);
  }

  // SqliteStorage requires the async create() path; memory uses the constructor.
  const server =
    storage === "sqlite"
      ? await OntologyOmsServer.create({
          port: opts.port,
          authToken: opts.authToken,
          storage: "sqlite",
          dbPath: opts.dbPath,
        })
      : new OntologyOmsServer({ port: opts.port, authToken: opts.authToken });
  console.log(
    `Storage backend: ${storage}${storage === "sqlite" && opts.dbPath ? ` (${opts.dbPath})` : ""}`,
  );

  await server.registerConcepts(concepts);
  await server.start();
  console.log(`✓ OMS server running on http://localhost:${opts.port}/api/v1/`);
  console.log("  Press Ctrl+C to stop");

  process.on("SIGINT", async () => {
    await server.stop();
    console.log("\n✓ OMS server stopped");
    process.exit(0);
  });
}
