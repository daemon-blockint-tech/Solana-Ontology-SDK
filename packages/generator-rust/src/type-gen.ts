import type { Concept, ConceptProperty } from "@solana-ontology/core";

/**
 * Map Solana ontology types to Rust types.
 */
export function mapSolanaTypeToRust(type: string): string {
  const typeMap: Record<string, string> = {
    Address: "Pubkey",
    Hash: "Hash",
    Signature: "Signature",
    u8: "u8",
    u16: "u16",
    u32: "u32",
    u64: "u64",
    u128: "u128",
    i32: "i32",
    i64: "i64",
    i128: "i128",
    f64: "f64",
    bool: "bool",
    bytes: "Vec<u8>",
    string: "String",
  };

  if (typeMap[type]) return typeMap[type];

  if (type.endsWith("[]")) {
    const inner = type.slice(0, -2);
    return `Vec<${mapSolanaTypeToRust(inner)}>`;
  }

  return type;
}

/**
 * Convert a PascalCase concept name to snake_case for Rust.
 */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Generate a Rust struct for a concept's properties.
 */
export function generateRustStruct(concept: Concept): string {
  const name = concept.canonicalName;
  const lines: string[] = [];

  lines.push(`/// ${concept.purpose}`);
  lines.push(`#[derive(Debug, Clone, PartialEq)]`);
  lines.push(`pub struct ${name} {`);

  if (concept.properties) {
    for (const prop of concept.properties) {
      if (prop.description) {
        lines.push(`    /// ${prop.description}`);
      }
      const rustType = mapSolanaTypeToRust(prop.type);
      const fieldName = toSnakeCase(prop.name);
      if (prop.required) {
        lines.push(`    pub ${fieldName}: ${rustType},`);
      } else {
        lines.push(`    pub ${fieldName}: Option<${rustType}>,`);
      }
    }
  }

  lines.push(`}`);
  return lines.join("\n");
}
