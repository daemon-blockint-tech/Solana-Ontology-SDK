import { loadConcepts, validateAll } from "@solana-ontology/core";
import { OntologyOmsServer } from "@solana-ontology/oms";
import type { CliConfig } from "../config.js";

export async function omsCommand(
  config: CliConfig,
  opts: { port: number; authToken?: string },
): Promise<void> {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  console.log(`Loaded ${concepts.length} concepts`);

  const result = validateAll(concepts);
  if (!result.valid) {
    console.error(`✗ Validation failed with ${result.errors.length} error(s)`);
    process.exit(1);
  }

  const server = new OntologyOmsServer({
    port: opts.port,
    authToken: opts.authToken,
  });

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
