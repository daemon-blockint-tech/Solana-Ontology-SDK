import type { Concept, BorshFieldDef } from "@solana-ontology/core";

/**
 * Rust type mapping for ontology types.
 *
 * The rule here is "code is a memory map, not text": every ontology type maps to
 * a Rust type whose in-memory representation matches the on-chain value, and the
 * mapping is *total* — an unmapped type never leaks through as an identifier that
 * does not exist in Rust (which is how a generator emits code that cannot compile).
 *
 * Fixed-width on-chain values stay on the stack as arrays (`[u8; 32]`/`[u8; 64]`)
 * rather than becoming heap-allocated wrapper types.
 */

/** Rust types this generator can emit that require an import. */
const IMPORTS: Record<string, string> = {
  Pubkey: "solana_program::pubkey::Pubkey",
};

/** Keywords that cannot be used as identifiers; `r#` makes them usable. */
const RUST_KEYWORDS = new Set([
  "as",
  "break",
  "const",
  "continue",
  "crate",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  "async",
  "await",
  "dyn",
  "abstract",
  "become",
  "box",
  "do",
  "final",
  "macro",
  "override",
  "priv",
  "typeof",
  "unsized",
  "virtual",
  "yield",
  "try",
  "gen",
]);

/** Keywords that are NOT valid as raw identifiers — must be renamed instead. */
const NON_RAW_KEYWORDS = new Set(["crate", "self", "super", "Self"]);

/**
 * Make an identifier safe to emit as a Rust field name. Rust keywords become raw
 * identifiers (`r#type`); the few keywords that cannot be raw get a `_` suffix.
 */
export function toRustIdent(name: string): string {
  if (NON_RAW_KEYWORDS.has(name)) return `${name}_`;
  if (RUST_KEYWORDS.has(name)) return `r#${name}`;
  return name;
}

/**
 * Map an ontology type to a Rust type. Total: unknown types (concept references
 * such as `Metadata`) resolve to `Pubkey`, which is how another account is
 * actually represented on chain.
 */
export function mapSolanaTypeToRust(type: string): string {
  const typeMap: Record<string, string> = {
    Address: "Pubkey",
    publicKey: "Pubkey",
    PublicKey: "Pubkey",
    // Fixed-width on-chain values — kept on the stack, no heap wrapper type.
    Hash: "[u8; 32]",
    Signature: "[u8; 64]",
    u8: "u8",
    u16: "u16",
    u32: "u32",
    u64: "u64",
    u128: "u128",
    i8: "i8",
    i16: "i16",
    i32: "i32",
    i64: "i64",
    i128: "i128",
    f32: "f32",
    f64: "f64",
    bool: "bool",
    bytes: "Vec<u8>",
    string: "String",
    String: "String",
  };

  const direct = typeMap[type];
  if (direct) return direct;

  // `T[]` and `Vec<T>` → Vec<T>
  if (type.endsWith("[]")) {
    return `Vec<${mapSolanaTypeToRust(type.slice(0, -2))}>`;
  }
  const generic = /^(COption|Option|Vec)<(.+)>$/.exec(type);
  if (generic) {
    const [, wrapper, inner] = generic;
    // Solana's COption decodes to a plain Option under Borsh.
    const rustWrapper = wrapper === "COption" ? "Option" : wrapper;
    return `${rustWrapper}<${mapSolanaTypeToRust(inner)}>`;
  }

  // Unknown type = a reference to another concept's account → Pubkey.
  return "Pubkey";
}

/**
 * The exact set of `use` statements required by the given Rust types — nothing
 * is imported that isn't used, and nothing used goes unimported.
 */
export function requiredImports(rustTypes: string[]): string[] {
  const needed = new Set<string>();
  for (const t of rustTypes) {
    for (const [rustType, path] of Object.entries(IMPORTS)) {
      // Match the type as a whole word so `Pubkey` inside `Vec<Pubkey>` counts.
      if (new RegExp(`\\b${rustType}\\b`).test(t)) needed.add(path);
    }
  }
  return Array.from(needed).sort();
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

/** Collapse a description to a single line so it is a valid doc comment. */
function docLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A field of the generated struct, resolved to its Rust type. */
interface RustField {
  name: string;
  rustType: string;
  doc?: string;
  offset?: number;
}

/**
 * Resolve a concept's fields in their real memory order. When the concept
 * declares an `accountLayout`, that byte order is authoritative (it is the actual
 * on-chain layout); otherwise properties are used in declaration order.
 */
export function resolveRustFields(concept: Concept): RustField[] {
  const layout = concept.accountLayout?.fields;
  const props = concept.properties ?? [];

  if (layout && layout.length > 0) {
    return layout.map((f: BorshFieldDef) => {
      const prop = props.find((p) => p.name === f.name);
      return {
        name: toRustIdent(toSnakeCase(f.name)),
        // Layout fields are physically present, so they are never Option<T>
        // unless the declared type itself is optional.
        rustType: mapSolanaTypeToRust(f.type),
        doc: f.description ?? prop?.description,
        offset: f.offset,
      };
    });
  }

  return props.map((prop) => {
    const rustType = mapSolanaTypeToRust(prop.type);
    return {
      name: toRustIdent(toSnakeCase(prop.name)),
      rustType: prop.required ? rustType : `Option<${rustType}>`,
      doc: prop.description,
    };
  });
}

/**
 * Generate a Borsh-decodable Rust struct for a concept.
 *
 * Note: no `#[repr(C)]` — Borsh's wire layout is not C layout, so claiming a
 * guaranteed memory layout here would be false.
 */
export function generateRustStruct(concept: Concept): string {
  const name = concept.canonicalName;
  const fields = resolveRustFields(concept);
  const lines: string[] = [];

  lines.push(`/// ${docLine(concept.purpose)}`);
  if (concept.accountLayout?.fields?.length) {
    lines.push(`///`);
    lines.push(`/// Field order follows the on-chain account layout.`);
  }
  lines.push(`#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]`);
  lines.push(`pub struct ${name} {`);

  for (const field of fields) {
    if (field.doc) lines.push(`    /// ${docLine(field.doc)}`);
    if (field.offset !== undefined) lines.push(`    /// Byte offset: ${field.offset}`);
    lines.push(`    pub ${field.name}: ${field.rustType},`);
  }

  lines.push(`}`);
  return lines.join("\n");
}
