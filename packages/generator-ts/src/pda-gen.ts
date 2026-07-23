import type { Concept } from "@solana-ontology/core";

/**
 * Check if a concept has a derivedFrom PDA relationship.
 */
export function isPDA(concept: Concept): boolean {
  return (
    concept.relationships?.some((r) => r.type === "derivedFrom" && r.target === "PDA") ?? false
  );
}

/**
 * Generate a PDA derivation helper function for a concept.
 */
export function generatePdaHelper(concept: Concept): string | null {
  if (!isPDA(concept)) return null;

  const name = concept.canonicalName;
  const fnName = `derive${name}Address`;

  return [
    `/**`,
    ` * Derive the PDA for a ${name} using program-defined seeds.`,
    ` * @param programId Program that owns this PDA`,
    ` * @param seeds Seed components for derivation`,
    ` * @returns Object containing the derived address and bump seed`,
    ` */`,
    `export function ${fnName}(`,
    `  programId: string,`,
    `  seeds: Uint8Array[],`,
    `): { address: string; bump: number } {`,
    `  // TODO: Implement using @solana/kit getProgramDerivedAddress`,
    `  // or web3.js PublicKey.findProgramAddress`,
    `  throw new Error(\`${fnName} not yet implemented — requires @solana/kit or web3.js\`);`,
    `}`,
  ].join("\n");
}
