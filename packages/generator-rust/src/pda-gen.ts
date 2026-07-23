import type { Concept } from "@solana-ontology/core";
import { toSnakeCase } from "./type-gen.js";

/**
 * Check if a concept has a derivedFrom PDA relationship.
 */
export function isPDA(concept: Concept): boolean {
  return (
    concept.relationships?.some((r) => r.type === "derivedFrom" && r.target === "PDA") ?? false
  );
}

/**
 * Generate a Rust PDA derivation helper function.
 */
export function generateRustPdaHelper(concept: Concept): string | null {
  if (!isPDA(concept)) return null;

  const name = concept.canonicalName;
  const snakeName = toSnakeCase(name);

  return [
    `/// Derive the PDA for a ${name}.`,
    `pub fn derive_${snakeName}_address(`,
    `    program_id: &Pubkey,`,
    `    seeds: &[&[u8]],`,
    `) -> (Pubkey, u8) {`,
    `    // TODO: Implement using Pubkey::find_program_address`,
    `    unimplemented!("derive_${snakeName}_address")`,
    `}`,
  ].join("\n");
}
