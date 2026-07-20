import { loadConcepts, validateAll } from "@solana-ontology/core";
import type { CliConfig } from "../config.js";

export function validateCommand(config: CliConfig): void {
  console.log(`Loading concepts from: ${config.conceptsDir}`);
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  console.log(`Loaded ${concepts.length} concepts`);

  const result = validateAll(concepts);

  if (result.valid) {
    console.log(`\n✓ All ${concepts.length} concepts are valid`);
    return;
  }

  console.error(`\n✗ Found ${result.errors.length} validation error(s):\n`);
  for (const error of result.errors) {
    console.error(`  [${error.file}] ${error.conceptName ?? "unknown"}`);
    console.error(`    ${error.message}`);
    if (error.path) {
      console.error(`    at: ${error.path}`);
    }
    console.error();
  }

  process.exit(1);
}
