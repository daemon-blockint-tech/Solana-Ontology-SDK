import type { Concept, ConceptProperty } from "@solana-ontology/core";

/**
 * Map Solana ontology types to TypeScript types.
 */
export function mapSolanaTypeToTs(type: string): string {
  const typeMap: Record<string, string> = {
    Address: "string",
    Hash: "string",
    Signature: "string",
    u8: "number",
    u16: "number",
    u32: "number",
    u64: "bigint",
    u128: "bigint",
    i32: "number",
    i64: "bigint",
    i128: "bigint",
    f64: "number",
    bool: "boolean",
    bytes: "Uint8Array",
    string: "string",
  };

  if (typeMap[type]) return typeMap[type];

  if (type.endsWith("[]")) {
    const inner = type.slice(0, -2);
    return `${mapSolanaTypeToTs(inner)}[]`;
  }

  return type;
}

/**
 * Generate a TypeScript interface for a concept's properties.
 */
export function generateAccountInterface(concept: Concept): string {
  const name = concept.canonicalName;
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * ${concept.purpose}`);
  lines.push(` * @category ${concept.category}`);
  lines.push(` * @version ${concept.version}`);
  lines.push(` */`);
  lines.push(`export interface ${name} {`);

  if (concept.properties) {
    for (const prop of concept.properties) {
      if (prop.description) {
        lines.push(`  /** ${prop.description} */`);
      }
      const optional = !prop.required ? "?" : "";
      const tsType = mapSolanaTypeToTs(prop.type);
      lines.push(`  ${prop.name}${optional}: ${tsType};`);
    }
  }

  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Generate a decoder function for a concept.
 */
export function generateDecoder(concept: Concept): string {
  const name = concept.canonicalName;
  return [
    `/**`,
    ` * Decode raw account data into a typed ${name} object.`,
    ` * NOTE: This is a generated stub. Implement actual byte layout decoding.`,
    ` */`,
    `export function decode${name}(data: Uint8Array): ${name} {`,
    `  // TODO: Implement actual byte-layout decoding based on Anchor IDL`,
    `  // or program-specific account layout.`,
    `  throw new Error(\`decode${name} not yet implemented — requires IDL or layout spec\`);`,
    `}`,
  ].join("\n");
}

/**
 * Generate an encoder function for a concept.
 */
export function generateEncoder(concept: Concept): string {
  const name = concept.canonicalName;
  return [
    `/**`,
    ` * Encode a ${name} object into raw bytes for on-chain storage.`,
    ` * NOTE: This is a generated stub. Implement actual byte layout encoding.`,
    ` */`,
    `export function encode${name}(value: ${name}): Uint8Array {`,
    `  // TODO: Implement actual byte-layout encoding based on Anchor IDL`,
    `  // or program-specific account layout.`,
    `  throw new Error(\`encode${name} not yet implemented — requires IDL or layout spec\`);`,
    `}`,
  ].join("\n");
}
