// ── IDL v0 (Legacy Anchor < 0.30) ──────────────────────────────────────────

export interface IdlV0Field {
  name: string;
  type: string | IdlV0Type;
  attrs?: string[];
}

export interface IdlV0Type {
  defined?: string;
  option?: string | IdlV0Type;
  vec?: string | IdlV0Type;
  array?: [string | IdlV0Type, number];
  coption?: string | IdlV0Type;
}

export interface IdlV0Account {
  name: string;
  type: {
    kind: "struct";
    fields: IdlV0Field[];
  };
}

export interface IdlV0InstructionArg {
  name: string;
  type: string | IdlV0Type;
}

export interface IdlV0InstructionAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
}

export interface IdlV0Instruction {
  name: string;
  accounts: IdlV0InstructionAccount[];
  args: IdlV0InstructionArg[];
}

export interface IdlV0 {
  version: string;
  name: string;
  instructions: IdlV0Instruction[];
  accounts?: IdlV0Account[];
  types?: { name: string; type: { kind: string; fields: IdlV0Field[] } }[];
  errors?: { code: number; name: string; msg?: string }[];
  metadata?: {
    address?: string;
  };
}

// ── IDL v1 (Modern Anchor >= 0.30) ─────────────────────────────────────────

export interface IdlV1Field {
  name: string;
  type: string | IdlV1Type;
  attrs?: string[];
}

export interface IdlV1Type {
  defined?: string;
  option?: string | IdlV1Type;
  vec?: string | IdlV1Type;
  array?: [string | IdlV1Type, number];
  coption?: string | IdlV1Type;
  pubkey?: boolean;
}

export interface IdlV1Account {
  name: string;
  discriminator: number[];
  type: {
    kind: "struct";
    fields: IdlV1Field[];
  };
}

export interface IdlV1InstructionArg {
  name: string;
  type: string | IdlV1Type;
}

export interface IdlV1InstructionAccount {
  name: string;
  writable: boolean;
  signer: boolean;
  address?: string;
}

export interface IdlV1Instruction {
  name: string;
  discriminator: number[];
  accounts: IdlV1InstructionAccount[];
  args: IdlV1InstructionArg[];
}

export interface IdlV1 {
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
    description?: string;
  };
  instructions: IdlV1Instruction[];
  accounts: IdlV1Account[];
  types?: { name: string; type: { kind: string; fields: IdlV1Field[] } }[];
  errors?: { code: number; name: string; msg?: string }[];
}

// ── Helper type guards ─────────────────────────────────────────────────────

export function isIdlV0(idl: unknown): idl is IdlV0 {
  const obj = idl as Record<string, unknown>;
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj["version"] === "string" &&
    typeof obj["name"] === "string" &&
    Array.isArray(obj["instructions"]) &&
    !("address" in obj) // v0 has no top-level address
  );
}

export function isIdlV1(idl: unknown): idl is IdlV1 {
  const obj = idl as Record<string, unknown>;
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj["address"] === "string" &&
    typeof obj["metadata"] === "object" &&
    Array.isArray(obj["instructions"])
  );
}
