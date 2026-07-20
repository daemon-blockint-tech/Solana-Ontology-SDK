import { loadConcepts, validateAll } from "@solana-ontology/core";
import { generateAll } from "@solana-ontology/generator-ts";
import { generateAllRust } from "@solana-ontology/generator-rust";
import type { CliConfig } from "../config.js";

export function generateCommand(
  lang: string,
  config: CliConfig,
  outputDir?: string,
): void {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  console.log(`Loaded ${concepts.length} concepts`);

  const result = validateAll(concepts);
  if (!result.valid) {
    console.error(`✗ Validation failed with ${result.errors.length} error(s)`);
    process.exit(1);
  }

  if (lang === "ts") {
    const outDir = outputDir ?? config.tsOutputDir;
    console.log(`Generating TypeScript to: ${outDir}`);
    const files = generateAll(concepts, { outputDir: outDir });
    console.log(`✓ Generated ${files.length} TypeScript files`);
  } else if (lang === "rust") {
    const outDir = outputDir ?? config.rustOutputDir;
    console.log(`Generating Rust to: ${outDir}`);
    const files = generateAllRust(concepts, { outputDir: outDir });
    console.log(`✓ Generated ${files.length} Rust files`);
  } else {
    console.error(`Unknown language: ${lang}. Use 'ts' or 'rust'.`);
    process.exit(1);
  }
}
