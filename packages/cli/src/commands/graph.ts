import { loadConcepts, buildGraph } from "@solana-ontology/core";
import type { CliConfig } from "../config.js";

export function graphCommand(config: CliConfig): void {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  const graph = buildGraph(concepts);

  const lines: string[] = ["graph TD"];

  for (const concept of concepts) {
    const rels = graph.edges.get(concept.canonicalName);
    if (!rels) continue;
    for (const rel of rels) {
      lines.push(`  ${concept.canonicalName} -->|${rel.type}| ${rel.target}`);
    }
  }

  if (graph.orphans.length > 0) {
    lines.push("");
    lines.push(`  %% Orphan concepts (not referenced by others):`);
    for (const orphan of graph.orphans) {
      lines.push(`  %% ${orphan}`);
    }
  }

  console.log(lines.join("\n"));
}
