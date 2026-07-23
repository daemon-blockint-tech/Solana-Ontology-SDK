import type { Concept, ConceptRelationship } from "@solana-ontology/core";

/**
 * Find all cpiTo relationships in a concept.
 */
export function findCpiRelationships(concept: Concept): ConceptRelationship[] {
  return (concept.relationships ?? []).filter((r) => r.type === "cpiTo");
}

/**
 * Generate a CPI helper function for a cpiTo relationship.
 * The generated function creates a TransactionInstruction that invokes
 * the target program's instruction via Cross-Program Invocation.
 */
export function generateCpiHelper(concept: Concept, rel: ConceptRelationship): string {
  const sourceName = concept.canonicalName;
  const targetName = rel.target;
  const fnName = `cpiTo${targetName}`;

  return [
    `/**`,
    ` * Create a CPI instruction from ${sourceName} to ${targetName}.`,
    ` * @param programId The ${sourceName} program ID`,
    ` * @param accounts Account map for the CPI invocation`,
    ` * @param data Serialized instruction data for ${targetName}`,
    ` * @returns TransactionInstruction for the CPI call`,
    ` */`,
    `export function ${fnName}(`,
    `  programId: string,`,
    `  accounts: Record<string, string>,`,
    `  data: Uint8Array,`,
    `): import("@solana/web3.js").TransactionInstruction {`,
    `  const { TransactionInstruction, PublicKey } = require("@solana/web3.js");`,
    `  return new TransactionInstruction({`,
    `    programId: new PublicKey(programId),`,
    `    keys: Object.entries(accounts).map(([name, pubkey]) => ({`,
    `      pubkey: new PublicKey(pubkey),`,
    `      isSigner: name === "authority" || name === "signer",`,
    `      isWritable: true,`,
    `    })),`,
    `    data: Buffer.from(data),`,
    `  });`,
    `}`,
  ].join("\n");
}

/**
 * Generate all CPI helpers for a concept.
 * Returns an array of generated function strings, or empty if no cpiTo relationships.
 */
export function generateCpiHelpers(concept: Concept): string[] {
  const cpiRels = findCpiRelationships(concept);
  if (cpiRels.length === 0) return [];

  return cpiRels.map((rel) => generateCpiHelper(concept, rel));
}

/**
 * Generate a complete CPI helpers file for all concepts with cpiTo relationships.
 */
export function generateCpiHelpersFile(concepts: Concept[]): string {
  const helpers: string[] = [];

  for (const concept of concepts) {
    const cpiHelpers = generateCpiHelpers(concept);
    if (cpiHelpers.length > 0) {
      helpers.push(`// ── ${concept.canonicalName} CPI Helpers ──\n`);
      helpers.push(...cpiHelpers);
      helpers.push("");
    }
  }

  if (helpers.length === 0) {
    return "// No CPI relationships found in the ontology.\n";
  }

  return helpers.join("\n");
}
