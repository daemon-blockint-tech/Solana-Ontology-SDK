import { loadConcepts } from "@solana-ontology/core";
import type { ConceptCategory } from "@solana-ontology/core";
import type { CliConfig } from "../config.js";

export function listCommand(config: CliConfig, category?: string): void {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  const filtered = category ? concepts.filter((c) => c.category === category) : concepts;

  if (filtered.length === 0) {
    console.log("No concepts found.");
    return;
  }

  console.log(`\n${filtered.length} concept(s)${category ? ` in category "${category}"` : ""}:\n`);
  console.log("  Name                Category         Version   Owner");
  console.log("  " + "-".repeat(70));

  for (const concept of filtered) {
    const name = concept.canonicalName.padEnd(20);
    const cat = concept.category.padEnd(16);
    const ver = concept.version.padEnd(10);
    const owner = concept.owner ?? "—";
    console.log(`  ${name} ${cat} ${ver} ${owner}`);
  }
}
