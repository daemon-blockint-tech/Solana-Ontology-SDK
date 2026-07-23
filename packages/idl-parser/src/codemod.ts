import { createHash } from "node:crypto";
import type {
  IdlV0,
  IdlV1,
  IdlV0Account,
  IdlV1Account,
  IdlV0Instruction,
  IdlV1Instruction,
  IdlV0Field,
  IdlV1Field,
  IdlV0InstructionAccount,
  IdlV1InstructionAccount,
  IdlV0Type,
  IdlV1Type,
} from "./types.js";

/**
 * Convert camelCase to snake_case.
 */
export function convertCamelToSnake(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Calculate the 8-byte Anchor discriminator for a given seed string.
 * Anchor uses SHA-256("global:<name>") and takes the first 8 bytes.
 */
export function calculateDiscriminator(seed: string): number[] {
  const hash = createHash("sha256");
  hash.update(`global:${seed}`);
  return Array.from(hash.digest().subarray(0, 8));
}

/**
 * Migrate a legacy v0 IDL to the modern v1 specification.
 *
 * Transformations applied:
 * 1. camelCase → snake_case for all identifiers
 * 2. Add 8-byte discriminators for accounts, instructions, and events
 * 3. isMut → writable, isSigner → signer (drop when false)
 * 4. Hoist name/version into nested metadata block, address to top level
 */
export function migrateIdlV0ToV1(idl: IdlV0): IdlV1 {
  const address = idl.metadata?.address ?? "";

  const accounts: IdlV1Account[] = (idl.accounts ?? []).map(migrateAccount);
  const instructions: IdlV1Instruction[] = idl.instructions.map(migrateInstruction);
  const types = (idl.types ?? []).map((t) => ({
    name: convertCamelToSnake(t.name),
    type: {
      kind: t.type.kind,
      fields: (t.type.fields ?? []).map(migrateField),
    },
  }));

  return {
    address,
    metadata: {
      name: convertCamelToSnake(idl.name),
      version: idl.version,
      spec: "0.1.0",
    },
    instructions,
    accounts,
    types: types.length > 0 ? types : undefined,
    errors: idl.errors,
  };
}

function migrateAccount(account: IdlV0Account): IdlV1Account {
  const snakeName = convertCamelToSnake(account.name);
  return {
    name: snakeName,
    discriminator: calculateDiscriminator(snakeName),
    type: {
      kind: account.type.kind,
      fields: (account.type.fields ?? []).map(migrateField),
    },
  };
}

function migrateInstruction(ix: IdlV0Instruction): IdlV1Instruction {
  const snakeName = convertCamelToSnake(ix.name);
  return {
    name: snakeName,
    discriminator: calculateDiscriminator(snakeName),
    accounts: ix.accounts.map(migrateInstructionAccount),
    args: ix.args.map((arg) => ({
      name: convertCamelToSnake(arg.name),
      type: migrateType(arg.type),
    })),
  };
}

function migrateInstructionAccount(acc: IdlV0InstructionAccount): IdlV1InstructionAccount {
  return {
    name: convertCamelToSnake(acc.name),
    writable: acc.isMut,
    signer: acc.isSigner,
  };
}

function migrateField(field: IdlV0Field): IdlV1Field {
  return {
    name: convertCamelToSnake(field.name),
    type: migrateType(field.type),
    attrs: field.attrs,
  };
}

function migrateType(type: string | IdlV0Type): string | IdlV1Type {
  if (typeof type === "string") {
    return type;
  }
  const result: IdlV1Type = {};
  if (type.defined) result.defined = convertCamelToSnake(type.defined);
  if (type.option)
    result.option =
      typeof type.option === "string" ? type.option : (migrateType(type.option) as IdlV1Type);
  if (type.vec)
    result.vec = typeof type.vec === "string" ? type.vec : (migrateType(type.vec) as IdlV1Type);
  if (type.array) {
    result.array = [
      typeof type.array[0] === "string" ? type.array[0] : (migrateType(type.array[0]) as IdlV1Type),
      type.array[1],
    ];
  }
  if (type.coption)
    result.coption =
      typeof type.coption === "string" ? type.coption : (migrateType(type.coption) as IdlV1Type);
  return result;
}
