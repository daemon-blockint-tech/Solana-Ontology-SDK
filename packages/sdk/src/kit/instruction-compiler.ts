/**
 * Instruction compiler — builds ActionInstruction from IDL definitions + user params.
 * Implements minimal Borsh encoding without external borsh dependency.
 */

import type { ActionInstruction } from "./action.js";

export interface IdlInstructionDef {
  name: string;
  discriminator: number[];
  accounts: { name: string; writable: boolean; signer: boolean; address?: string }[];
  args: { name: string; type: string | { defined?: string; option?: unknown; vec?: unknown; array?: unknown } }[];
}

export interface CompiledAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

/**
 * Encode a primitive value to Borsh bytes.
 */
export function encodeBorshValue(type: string, value: unknown): Uint8Array {
  switch (type) {
    case "bool": {
      return new Uint8Array([value ? 1 : 0]);
    }
    case "u8": {
      return new Uint8Array([value as number & 0xff]);
    }
    case "u16": {
      const buf = new Uint8Array(2);
      new DataView(buf.buffer).setUint16(0, value as number, true);
      return buf;
    }
    case "u32": {
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setUint32(0, value as number, true);
      return buf;
    }
    case "u64":
    case "u128":
    case "i64":
    case "i128": {
      const v = BigInt(value as string | number | bigint);
      const buf = new Uint8Array(8);
      const view = new DataView(buf.buffer);
      view.setBigUint64(0, v & 0xffffffffffffffffn, true);
      return buf;
    }
    case "string": {
      const encoded = new TextEncoder().encode(value as string);
      const lenBuf = new Uint8Array(4);
      new DataView(lenBuf.buffer).setUint32(0, encoded.length, true);
      const result = new Uint8Array(4 + encoded.length);
      result.set(lenBuf, 0);
      result.set(encoded, 4);
      return result;
    }
    case "pubkey": {
      // Base58 decode would go here — for now we accept Uint8Array
      if (value instanceof Uint8Array) return value;
      // If it's a base58 string, we'd need bs58 decode
      // Return placeholder 32 bytes
      return new Uint8Array(32);
    }
    case "bytes": {
      const v = value as Uint8Array;
      const lenBuf = new Uint8Array(4);
      new DataView(lenBuf.buffer).setUint32(0, v.length, true);
      const result = new Uint8Array(4 + v.length);
      result.set(lenBuf, 0);
      result.set(v, 4);
      return result;
    }
    default: {
      // For complex types (defined, option, vec, array), return empty for now
      return new Uint8Array(0);
    }
  }
}

/**
 * Encode instruction data: discriminator + borsh-encoded args.
 */
export function encodeInstructionData(
  discriminator: number[],
  args: { name: string; type: string }[],
  params: Record<string, unknown>,
): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array(discriminator)];

  for (const arg of args) {
    const value = params[arg.name];
    if (value === undefined) {
      throw new Error(`Missing required argument: ${arg.name}`);
    }
    parts.push(encodeBorshValue(arg.type, value));
  }

  // Concatenate all parts
  const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Resolve named accounts from IDL definition to concrete pubkeys.
 */
export function resolveAccounts(
  idlAccounts: { name: string; writable: boolean; signer: boolean; address?: string }[],
  provided: Record<string, string>,
): CompiledAccount[] {
  const resolved: CompiledAccount[] = [];

  for (const acc of idlAccounts) {
    const pubkey = provided[acc.name] ?? acc.address;
    if (!pubkey) {
      throw new Error(`Missing required account: ${acc.name}`);
    }
    resolved.push({
      pubkey,
      isSigner: acc.signer,
      isWritable: acc.writable,
    });
  }

  return resolved;
}

/**
 * Compile a full instruction from an IDL definition and user-provided parameters.
 */
export function compileInstruction(
  programId: string,
  def: IdlInstructionDef,
  params: Record<string, unknown>,
  accounts: Record<string, string>,
): ActionInstruction {
  const resolvedAccounts = resolveAccounts(def.accounts, accounts);

  const argTypes = def.args.map((a) => ({
    name: a.name,
    type: typeof a.type === "string" ? a.type : "unknown",
  }));

  const data = encodeInstructionData(def.discriminator, argTypes, params);

  return {
    programId,
    accounts: resolvedAccounts.map((a) => ({
      pubkey: a.pubkey,
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data,
  };
}
