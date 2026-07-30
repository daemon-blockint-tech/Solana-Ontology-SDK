import type { Concept } from "@solana-ontology/core";

/**
 * Check if a concept has a derivedFrom PDA relationship.
 */
export function isPDA(concept: Concept): boolean {
  return (
    concept.relationships?.some((r) => r.type === "derivedFrom" && r.target === "PDA") ?? false
  );
}

/** Import line for generated files that use the SDK PDA derivation runtime. */
export const SDK_PDA_IMPORT =
  'import { derivePda, derivePdaFromConcept, type PdaResult } from "@solana-ontology/sdk";';

/**
 * Generate a real PDA derivation helper for a concept, wired to the SDK's
 * derivePda runtime (Kit-first with a web3.js fallback). When the concept
 * declares structured `pdaSeeds`, a typed seed-map overload is emitted too.
 * Returns null when the concept is not a PDA.
 */
export function generatePdaHelper(concept: Concept): string | null {
  if (!isPDA(concept)) return null;

  const name = concept.canonicalName;
  const fnName = `derive${name}Address`;
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Derive the PDA for a ${name} from raw seed byte-arrays.`);
  lines.push(` * @param programId Program that owns this PDA`);
  lines.push(` * @param seeds Seed components for derivation`);
  lines.push(` */`);
  lines.push(`export function ${fnName}(`);
  lines.push(`  programId: string,`);
  lines.push(`  seeds: Uint8Array[],`);
  lines.push(`): Promise<PdaResult> {`);
  lines.push(`  return derivePda(programId, seeds);`);
  lines.push(`}`);

  // Typed convenience overload when the concept declares structured seeds
  if (concept.pdaSeeds && concept.pdaSeeds.length > 0) {
    const seedType = concept.pdaSeeds
      .map((s) => `${s.name}: string | number | Uint8Array`)
      .join("; ");
    const defaultProgram = concept.programId ? ` = "${concept.programId}"` : "";
    lines.push(``);
    lines.push(`const ${name.toUpperCase()}_PDA_SEEDS = ${JSON.stringify(concept.pdaSeeds)};`);
    lines.push(``);
    lines.push(`/**`);
    lines.push(` * Derive the ${name} PDA from named seed values (per the concept's pdaSeeds).`);
    lines.push(` */`);
    lines.push(`export function ${fnName}FromSeeds(`);
    lines.push(`  seedValues: { ${seedType} },`);
    lines.push(`  programId${concept.programId ? "?" : ""}: string${defaultProgram},`);
    lines.push(`): Promise<PdaResult> {`);
    lines.push(
      `  return derivePdaFromConcept({ pdaSeeds: ${name.toUpperCase()}_PDA_SEEDS${concept.programId ? `, programId: "${concept.programId}"` : ""} }, programId, seedValues);`,
    );
    lines.push(`}`);
  }

  return lines.join("\n");
}
