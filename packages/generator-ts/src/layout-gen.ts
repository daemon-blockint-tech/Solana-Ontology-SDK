/**
 * Real Borsh account decode/encode generation from concept.accountLayout.
 *
 * Emits sequential reads/writes (offsets in the layout are treated as
 * documentation — variable-length fields make static offsets unreliable) plus
 * a discriminator check, against a small shared runtime (`runtime.ts`).
 */

import type { Concept } from "@solana-ontology/core";

interface LayoutField {
  name: string;
  type: string;
  offset?: number;
  description?: string;
}

/** Layout field types this generator supports (see runtime.ts readers/writers). */
const SCALAR_READERS: Record<string, { reader: string; writer: string; ts: string }> = {
  bool: { reader: "bool", writer: "bool", ts: "boolean" },
  u8: { reader: "u8", writer: "u8", ts: "number" },
  u16: { reader: "u16", writer: "u16", ts: "number" },
  u32: { reader: "u32", writer: "u32", ts: "number" },
  u64: { reader: "u64", writer: "u64", ts: "bigint" },
  u128: { reader: "u128", writer: "u128", ts: "bigint" },
  i8: { reader: "i8", writer: "i8", ts: "number" },
  i16: { reader: "i16", writer: "i16", ts: "number" },
  i32: { reader: "i32", writer: "i32", ts: "number" },
  i64: { reader: "i64", writer: "i64", ts: "bigint" },
  i128: { reader: "i128", writer: "i128", ts: "bigint" },
  f32: { reader: "f32", writer: "f32", ts: "number" },
  f64: { reader: "f64", writer: "f64", ts: "number" },
  publicKey: { reader: "pubkey", writer: "pubkey", ts: "string" },
  pubkey: { reader: "pubkey", writer: "pubkey", ts: "string" },
  Address: { reader: "pubkey", writer: "pubkey", ts: "string" },
  string: { reader: "string", writer: "string", ts: "string" },
  bytes: { reader: "bytes", writer: "bytes", ts: "Uint8Array" },
};

interface ResolvedField {
  name: string;
  tsType: string;
  /** Expression reading the field from a reader variable `r` */
  readExpr: string;
  /** Statement writing `value.<name>` to a writer variable `w` */
  writeStmt: string;
}

function resolveField(conceptName: string, field: LayoutField): ResolvedField {
  const scalar = SCALAR_READERS[field.type];
  if (scalar) {
    return {
      name: field.name,
      tsType: scalar.ts,
      readExpr: `r.${scalar.reader}()`,
      writeStmt: `w.${scalar.writer}(value.${field.name});`,
    };
  }

  // Option<T> (borsh, 1-byte tag) and COption<T> (SPL Token, 4-byte tag)
  const optionMatch = field.type.match(/^(C?)Option<(.+)>$/);
  if (optionMatch) {
    const inner = SCALAR_READERS[optionMatch[2]];
    if (inner) {
      const tagReader = optionMatch[1] === "C" ? "coptionTag" : "optionTag";
      return {
        name: field.name,
        tsType: `${inner.ts} | null`,
        readExpr: `r.${tagReader}() ? r.${inner.reader}() : null`,
        writeStmt:
          optionMatch[1] === "C"
            ? `w.coptionTag(value.${field.name} !== null); if (value.${field.name} !== null) w.${inner.writer}(value.${field.name});`
            : `w.optionTag(value.${field.name} !== null); if (value.${field.name} !== null) w.${inner.writer}(value.${field.name});`,
      };
    }
  }

  throw new Error(
    `Unsupported accountLayout field type "${field.type}" on ${conceptName}.${field.name} — ` +
      `supported: ${Object.keys(SCALAR_READERS).join(", ")}, Option<T>, COption<T>`,
  );
}

/** Whether a concept has a usable accountLayout for real codegen. */
export function hasAccountLayout(concept: Concept): boolean {
  return !!concept.accountLayout && concept.accountLayout.fields.length > 0;
}

/**
 * Generate the `XxxAccountData` interface typed from the layout fields.
 */
export function generateAccountDataInterface(concept: Concept): string {
  const name = concept.canonicalName;
  const fields = (concept.accountLayout?.fields ?? []) as LayoutField[];
  const lines: string[] = [];
  lines.push(`/** Decoded on-chain account data for ${name} (from accountLayout). */`);
  lines.push(`export interface ${name}AccountData {`);
  for (const field of fields) {
    const resolved = resolveField(name, field);
    if (field.description) lines.push(`  /** ${field.description} */`);
    lines.push(`  ${field.name}: ${resolved.tsType};`);
  }
  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Generate a real decoder from the concept's accountLayout.
 */
export function generateLayoutDecoder(concept: Concept): string {
  const name = concept.canonicalName;
  const fields = (concept.accountLayout?.fields ?? []) as LayoutField[];
  const disc = concept.accountLayout?.discriminator;

  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Decode raw account data into a typed ${name}AccountData object.`);
  lines.push(` * Verifies the account discriminator before reading fields.`);
  lines.push(` */`);
  lines.push(`export function decode${name}(data: Uint8Array): ${name}AccountData {`);
  if (disc) {
    lines.push(`  const discriminator = hexToBytes("${disc}");`);
    lines.push(`  checkDiscriminator("${name}", data, discriminator);`);
    lines.push(`  const r = new BorshReader(data, discriminator.length);`);
  } else {
    lines.push(`  const r = new BorshReader(data, 0);`);
  }
  lines.push(`  return {`);
  for (const field of fields) {
    const resolved = resolveField(name, field);
    lines.push(`    ${field.name}: ${resolved.readExpr},`);
  }
  lines.push(`  };`);
  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Generate a real encoder from the concept's accountLayout.
 */
export function generateLayoutEncoder(concept: Concept): string {
  const name = concept.canonicalName;
  const fields = (concept.accountLayout?.fields ?? []) as LayoutField[];
  const disc = concept.accountLayout?.discriminator;

  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Encode a ${name}AccountData object into raw on-chain bytes`);
  lines.push(` * (discriminator-prefixed, Borsh field order per accountLayout).`);
  lines.push(` */`);
  lines.push(`export function encode${name}(value: ${name}AccountData): Uint8Array {`);
  lines.push(`  const w = new BorshWriter();`);
  if (disc) {
    lines.push(`  w.raw(hexToBytes("${disc}"));`);
  }
  for (const field of fields) {
    const resolved = resolveField(name, field);
    lines.push(`  ${resolved.writeStmt}`);
  }
  lines.push(`  return w.toBytes();`);
  lines.push(`}`);
  return lines.join("\n");
}

/** Import line for generated files that use the layout runtime. */
export const LAYOUT_RUNTIME_IMPORT =
  'import { BorshReader, BorshWriter, hexToBytes, checkDiscriminator } from "./runtime.js";';

/**
 * The shared runtime emitted once per output directory as `runtime.ts`.
 * Self-contained: no external dependencies.
 */
export function generateLayoutRuntime(): string {
  return `// AUTO-GENERATED by @solana-ontology/generator-ts
// Shared Borsh runtime for generated account decoders/encoders. Do not edit.

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map<string, number>([...BASE58_ALPHABET].map((c, i) => [c, i]));

export function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let prefix = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    prefix += "1";
  }
  return prefix + digits.reverse().map((d) => BASE58_ALPHABET[d]).join("");
}

export function decodeBase58(input: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of input) {
    const value = BASE58_MAP.get(char);
    if (value === undefined) throw new Error(\`Invalid base58 character "\${char}"\`);
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(\`Invalid hex string length: \${hex.length}\`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(\`Invalid hex byte at position \${i * 2}\`);
    out[i] = byte;
  }
  return out;
}

export function checkDiscriminator(name: string, data: Uint8Array, expected: Uint8Array): void {
  if (data.length < expected.length) {
    throw new Error(
      \`\${name}: account data too short (\${data.length} bytes, need \${expected.length}-byte discriminator)\`,
    );
  }
  for (let i = 0; i < expected.length; i++) {
    if (data[i] !== expected[i]) {
      throw new Error(\`\${name}: discriminator mismatch — this is not a \${name} account\`);
    }
  }
}

export class BorshReader {
  private view: DataView;
  constructor(
    private data: Uint8Array,
    public offset = 0,
  ) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  private need(n: number): void {
    if (this.offset + n > this.data.length) {
      throw new Error(
        \`Unexpected end of account data at offset \${this.offset} (need \${n} more bytes)\`,
      );
    }
  }
  bool(): boolean {
    return this.u8() !== 0;
  }
  u8(): number {
    this.need(1);
    return this.data[this.offset++];
  }
  i8(): number {
    this.need(1);
    return this.view.getInt8(this.offset++);
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }
  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }
  u64(): bigint {
    this.need(8);
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }
  i64(): bigint {
    this.need(8);
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.u64();
    const hi = this.u64();
    return (hi << 64n) | lo;
  }
  i128(): bigint {
    return BigInt.asIntN(128, this.u128());
  }
  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }
  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }
  pubkey(): string {
    this.need(32);
    const bytes = this.data.subarray(this.offset, this.offset + 32);
    this.offset += 32;
    return encodeBase58(bytes);
  }
  bytes(): Uint8Array {
    const len = this.u32();
    this.need(len);
    const out = this.data.slice(this.offset, this.offset + len);
    this.offset += len;
    return out;
  }
  string(): string {
    return new TextDecoder().decode(this.bytes());
  }
  /** Borsh option tag: 1 byte, 0 = None, 1 = Some */
  optionTag(): boolean {
    const tag = this.u8();
    if (tag > 1) throw new Error(\`Invalid Option tag \${tag} at offset \${this.offset - 1}\`);
    return tag === 1;
  }
  /** SPL Token COption tag: 4 bytes LE, 0 = None, 1 = Some */
  coptionTag(): boolean {
    const tag = this.u32();
    if (tag > 1) throw new Error(\`Invalid COption tag \${tag} at offset \${this.offset - 4}\`);
    return tag === 1;
  }
}

export class BorshWriter {
  private parts: Uint8Array[] = [];
  raw(bytes: Uint8Array): void {
    this.parts.push(bytes);
  }
  bool(v: boolean): void {
    this.u8(v ? 1 : 0);
  }
  u8(v: number): void {
    this.raw(new Uint8Array([v & 0xff]));
  }
  i8(v: number): void {
    const b = new Uint8Array(1);
    new DataView(b.buffer).setInt8(0, v);
    this.raw(b);
  }
  u16(v: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this.raw(b);
  }
  i16(v: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v, true);
    this.raw(b);
  }
  u32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    this.raw(b);
  }
  i32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    this.raw(b);
  }
  u64(v: bigint): void {
    if (v < 0n || v > 0xffffffffffffffffn) throw new Error(\`Value \${v} out of range for u64\`);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, v, true);
    this.raw(b);
  }
  i64(v: bigint): void {
    if (v < -(2n ** 63n) || v > 2n ** 63n - 1n) throw new Error(\`Value \${v} out of range for i64\`);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, v, true);
    this.raw(b);
  }
  u128(v: bigint): void {
    if (v < 0n || v > 2n ** 128n - 1n) throw new Error(\`Value \${v} out of range for u128\`);
    this.u64(v & 0xffffffffffffffffn);
    this.u64(v >> 64n);
  }
  i128(v: bigint): void {
    if (v < -(2n ** 127n) || v > 2n ** 127n - 1n)
      throw new Error(\`Value \${v} out of range for i128\`);
    this.u128(BigInt.asUintN(128, v));
  }
  f32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this.raw(b);
  }
  f64(v: number): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.raw(b);
  }
  pubkey(v: string): void {
    const bytes = decodeBase58(v);
    if (bytes.length !== 32) {
      throw new Error(\`Pubkey "\${v}" decodes to \${bytes.length} bytes, expected 32\`);
    }
    this.raw(bytes);
  }
  bytes(v: Uint8Array): void {
    this.u32(v.length);
    this.raw(v);
  }
  string(v: string): void {
    this.bytes(new TextEncoder().encode(v));
  }
  optionTag(some: boolean): void {
    this.u8(some ? 1 : 0);
  }
  coptionTag(some: boolean): void {
    this.u32(some ? 1 : 0);
  }
  toBytes(): Uint8Array {
    const total = this.parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}
`;
}
