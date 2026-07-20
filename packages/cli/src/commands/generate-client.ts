import { loadConcepts, validateAll } from "@solana-ontology/core";
import { generateClientFiles, emitClientPackage } from "@solana-ontology/generator-client";
import type { CliConfig } from "../config.js";

export function generateClientCommand(
  config: CliConfig,
  opts: {
    out: string;
    packageName: string;
    react: boolean;
    queries: boolean;
  },
): void {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  console.log(`Loaded ${concepts.length} concepts`);

  const result = validateAll(concepts);
  if (!result.valid) {
    console.error(`✗ Validation failed with ${result.errors.length} error(s)`);
    process.exit(1);
  }

  const files = generateClientFiles(concepts, {
    packageName: opts.packageName,
    generateReact: opts.react,
    generateQueries: opts.queries,
  });

  emitClientPackage(files, opts.out);
  console.log(`✓ Generated ${files.length} client files to: ${opts.out}`);
  console.log(`  Package: ${opts.packageName}`);
  console.log(`  React hooks: ${opts.react ? "yes" : "no"}`);
  console.log(`  Query builders: ${opts.queries ? "yes" : "no"}`);
}
