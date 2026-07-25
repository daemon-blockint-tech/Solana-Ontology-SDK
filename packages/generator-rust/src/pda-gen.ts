import type { Concept, PdaSeedDef } from "@solana-ontology/core";
import { toSnakeCase, toRustIdent } from "./type-gen.js";

/**
 * Check if a concept has a derivedFrom PDA relationship.
 */
export function isPDA(concept: Concept): boolean {
  return (
    concept.relationships?.some((r) => r.type === "derivedFrom" && r.target === "PDA") ?? false
  );
}

/** How one declared seed is passed in and turned into bytes. */
interface SeedBinding {
  /** Function parameter, e.g. `maker: &Pubkey`. */
  param: string;
  /** Optional `let` binding needed so a temporary outlives the seed slice. */
  local?: string;
  /** The expression placed in the seeds array, e.g. `maker.as_ref()`. */
  seedExpr: string;
}

/**
 * Bind a declared seed to borrowed Rust.
 *
 * Integer seeds are materialised into a named local (`let x_bytes = x.to_le_bytes();`)
 * and the seeds array borrows that. Inlining `&x.to_le_bytes()` also compiles here —
 * Rust extends the temporary to the end of the enclosing statement — but the named
 * binding keeps the byte conversion explicit and stays valid if the emitted shape
 * ever moves the seeds array into its own binding. Pubkey and byte seeds are
 * borrowed directly: no clone, no `to_vec`, no allocation on this path.
 */
function bindSeed(seed: PdaSeedDef): SeedBinding {
  const name = toRustIdent(toSnakeCase(seed.name));
  const localName = `${name.replace(/^r#/, "")}_bytes`;

  switch (seed.type) {
    case "publicKey":
      return { param: `${name}: &Pubkey`, seedExpr: `${name}.as_ref()` };
    case "string":
      return { param: `${name}: &str`, seedExpr: `${name}.as_bytes()` };
    case "bytes":
      return { param: `${name}: &[u8]`, seedExpr: name };
    case "u8":
      // A single byte: bind the array so the slice borrows a live local.
      return {
        param: `${name}: u8`,
        local: `let ${localName} = [${name}];`,
        seedExpr: `&${localName}`,
      };
    case "u32":
    case "u64":
    default:
      return {
        param: `${name}: ${seed.type}`,
        local: `let ${localName} = ${name}.to_le_bytes();`,
        seedExpr: `&${localName}`,
      };
  }
}

/**
 * Generate a Rust PDA derivation helper.
 *
 * When the concept declares typed `pdaSeeds`, the helper takes those seeds as
 * borrowed, typed parameters and performs the real derivation. Otherwise it
 * accepts caller-supplied seed slices — either way it actually derives an
 * address rather than leaving a stub behind.
 */
export function generateRustPdaHelper(concept: Concept): string | null {
  const hasSeeds = (concept.pdaSeeds?.length ?? 0) > 0;
  if (!isPDA(concept) && !hasSeeds) return null;

  const name = concept.canonicalName;
  const snakeName = toSnakeCase(name);

  if (!hasSeeds) {
    // No declared seed structure — the caller supplies the seed slices, which we
    // borrow as-is. Still a real derivation, not a stub.
    return [
      `/// Derive the PDA for a ${name} from caller-supplied seeds.`,
      `///`,
      `/// This concept does not declare \`pdaSeeds\`, so the seed structure is the`,
      `/// caller's responsibility.`,
      `pub fn derive_${snakeName}_address(program_id: &Pubkey, seeds: &[&[u8]]) -> (Pubkey, u8) {`,
      `    Pubkey::find_program_address(seeds, program_id)`,
      `}`,
    ].join("\n");
  }

  const bindings = (concept.pdaSeeds ?? []).map(bindSeed);
  const params = ["program_id: &Pubkey", ...bindings.map((b) => b.param)].join(", ");
  const locals = bindings.filter((b) => b.local).map((b) => `    ${b.local}`);
  const seedList = [`b"${snakeName}"`, ...bindings.map((b) => b.seedExpr)].join(", ");

  const lines = [
    `/// Derive the PDA for a ${name}.`,
    `///`,
    `/// Seeds are borrowed — no allocation occurs on this path.`,
    `pub fn derive_${snakeName}_address(${params}) -> (Pubkey, u8) {`,
  ];
  if (locals.length > 0) {
    // Integer seeds become named byte-array locals that the seeds slice borrows.
    lines.push(...locals);
  }
  lines.push(`    Pubkey::find_program_address(&[${seedList}], program_id)`);
  lines.push(`}`);

  return lines.join("\n");
}
