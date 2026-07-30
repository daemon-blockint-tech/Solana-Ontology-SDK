import type { Concept } from "@solana-ontology/core";
import {
  hasAccountLayout,
  generateAccountDataInterface,
  generateLayoutDecoder,
  generateLayoutEncoder,
} from "./layout-gen.js";

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
    i8: "number",
    i16: "number",
    i32: "number",
    i64: "bigint",
    i128: "bigint",
    f32: "number",
    f64: "number",
    bool: "boolean",
    bytes: "Uint8Array",
    string: "string",
    PublicKey: "string",
  };

  if (typeMap[type]) return typeMap[type];

  if (type.endsWith("[]")) {
    const inner = type.slice(0, -2);
    return `${mapSolanaTypeToTs(inner)}[]`;
  }

  // Ontology container types produced by the IDL concept generator
  if (type.startsWith("Option<") && type.endsWith(">")) {
    const inner = type.slice(7, -1);
    return `${mapSolanaTypeToTs(inner)} | null`;
  }
  if (type.startsWith("Vec<") && type.endsWith(">")) {
    const inner = type.slice(4, -1);
    return `${mapSolanaTypeToTs(inner)}[]`;
  }
  if (type.startsWith("Array<") && type.endsWith(">")) {
    const inner = type.slice(6, -1);
    const commaIdx = inner.lastIndexOf(",");
    const elem = commaIdx === -1 ? inner : inner.slice(0, commaIdx);
    return `${mapSolanaTypeToTs(elem.trim())}[]`;
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
 * Generate the decoded-account-data interface for a concept with a layout.
 * Returns null when the concept has no accountLayout.
 */
export function generateAccountDataTypes(concept: Concept): string | null {
  if (!hasAccountLayout(concept)) return null;
  return generateAccountDataInterface(concept);
}

/**
 * Generate a decoder function for a concept.
 *
 * Concepts with an `accountLayout` get a real Borsh decoder (discriminator
 * check + sequential typed reads). Concepts without one get a function that
 * throws an explicit "no layout in the ontology" error — decoding an account
 * without a declared layout is unsupported, not unimplemented.
 */
export function generateDecoder(concept: Concept): string {
  if (hasAccountLayout(concept)) {
    return generateLayoutDecoder(concept);
  }
  const name = concept.canonicalName;
  return [
    `/**`,
    ` * Decoding is unavailable for ${name}: its ontology concept declares no`,
    ` * \`accountLayout\`. Add one (or regenerate concepts from the program IDL)`,
    ` * to enable real decoding.`,
    ` */`,
    `export function decode${name}(_data: Uint8Array): never {`,
    `  throw new Error(`,
    `    "decode${name}: concept has no accountLayout in the ontology — add one (or run \`solana-ontology idl <program.json>\`) to enable decoding",`,
    `  );`,
    `}`,
  ].join("\n");
}

/**
 * Generate an encoder function for a concept.
 * Same support rule as {@link generateDecoder}.
 */
export function generateEncoder(concept: Concept): string {
  if (hasAccountLayout(concept)) {
    return generateLayoutEncoder(concept);
  }
  const name = concept.canonicalName;
  return [
    `/**`,
    ` * Encoding is unavailable for ${name}: its ontology concept declares no`,
    ` * \`accountLayout\`. Add one (or regenerate concepts from the program IDL)`,
    ` * to enable real encoding.`,
    ` */`,
    `export function encode${name}(_value: ${name}): never {`,
    `  throw new Error(`,
    `    "encode${name}: concept has no accountLayout in the ontology — add one (or run \`solana-ontology idl <program.json>\`) to enable encoding",`,
    `  );`,
    `}`,
  ].join("\n");
}
