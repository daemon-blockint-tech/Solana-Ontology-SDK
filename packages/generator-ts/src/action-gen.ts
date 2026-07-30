import type { Concept, StateTransition, IdlInstructionRef } from "@solana-ontology/core";

/**
 * Map a textual IDL arg type ("u64", "option<pubkey>", ...) to the TS
 * parameter type accepted by the SDK's borsh encoder.
 */
function mapIdlArgTypeToTs(type: string): string {
  const scalar: Record<string, string> = {
    bool: "boolean",
    u8: "number",
    u16: "number",
    u32: "number",
    i8: "number",
    i16: "number",
    i32: "number",
    f32: "number",
    f64: "number",
    u64: "bigint",
    u128: "bigint",
    i64: "bigint",
    i128: "bigint",
    string: "string",
    pubkey: "string",
    bytes: "Uint8Array",
  };
  if (scalar[type]) return scalar[type];
  const option = type.match(/^option<(.+)>$/);
  if (option) return `${mapIdlArgTypeToTs(option[1])} | null`;
  const vec = type.match(/^vec<(.+)>$/);
  if (vec) return `${mapIdlArgTypeToTs(vec[1])}[]`;
  const array = type.match(/^array<(.+),\s*\d+>$/);
  if (array) return array[1] === "u8" ? "Uint8Array" : `${mapIdlArgTypeToTs(array[1])}[]`;
  // defined<Struct> and anything else: accepted structurally, validated by the
  // encoder at runtime (defined structs are rejected there with an explicit error)
  return "unknown";
}

function toPascal(name: string): string {
  return name
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** True when the concept's idlInstruction carries enough data for real codegen. */
export function hasInstructionData(concept: Concept): concept is Concept & {
  idlInstruction: Required<
    Pick<IdlInstructionRef, "instructionName" | "discriminator" | "args" | "accounts">
  > &
    IdlInstructionRef;
} {
  const ref = concept.idlInstruction;
  return !!(
    ref &&
    ref.instructionName &&
    ref.discriminator &&
    ref.args &&
    ref.accounts &&
    ref.accounts.length > 0 &&
    (ref.programId ?? concept.programId)
  );
}

/**
 * Generate a real, typed instruction builder from the concept's
 * idlInstruction reference. Delegates encoding to the SDK's
 * compileInstruction (discriminator + borsh args + resolved accounts).
 * Returns null when the concept carries no instruction data.
 */
export function generateInstructionBuilder(concept: Concept): string | null {
  if (!hasInstructionData(concept)) return null;
  const ref = concept.idlInstruction;
  const conceptName = concept.canonicalName;
  const ixPascal = toPascal(ref.instructionName!);
  const programId = ref.programId ?? concept.programId!;
  const discBytes = (ref.discriminator!.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16));

  const lines: string[] = [];

  // Instruction definition constant (shape: sdk IdlInstructionDef)
  lines.push(`const ${ixPascal.toUpperCase()}_${conceptName.toUpperCase()}_IX = {`);
  lines.push(`  name: "${ref.instructionName}",`);
  lines.push(`  discriminator: [${discBytes.join(", ")}],`);
  lines.push(`  accounts: [`);
  for (const acc of ref.accounts!) {
    const parts = [
      `name: "${acc.name}"`,
      `writable: ${acc.writable === true}`,
      `signer: ${acc.signer === true}`,
    ];
    if (acc.address) parts.push(`address: "${acc.address}"`);
    lines.push(`    { ${parts.join(", ")} },`);
  }
  lines.push(`  ],`);
  lines.push(`  args: [`);
  for (const arg of ref.args!) {
    lines.push(`    { name: "${arg.name}", type: "${arg.type}" },`);
  }
  lines.push(`  ],`);
  lines.push(`};`);
  lines.push(``);

  // Typed params interface
  lines.push(`export interface ${ixPascal}${conceptName}Params {`);
  for (const arg of ref.args!) {
    const optional = arg.type.startsWith("option<") ? "?" : "";
    lines.push(`  ${arg.name}${optional}: ${mapIdlArgTypeToTs(arg.type)};`);
  }
  lines.push(`}`);
  lines.push(``);

  // Typed accounts interface — accounts with a fixed address are optional
  lines.push(`export interface ${ixPascal}${conceptName}Accounts {`);
  for (const acc of ref.accounts!) {
    const optional = acc.address ? "?" : "";
    lines.push(`  /** ${acc.writable ? "writable" : "readonly"}${acc.signer ? ", signer" : ""} */`);
    lines.push(`  ${acc.name}${optional}: string;`);
  }
  lines.push(`}`);
  lines.push(``);

  lines.push(`/**`);
  lines.push(` * Build the ${ref.instructionName} instruction for ${conceptName}.`);
  lines.push(` * Program: ${programId}`);
  lines.push(` */`);
  lines.push(`export function build${ixPascal}${conceptName}Instruction(`);
  lines.push(`  params: ${ixPascal}${conceptName}Params,`);
  lines.push(`  accounts: ${ixPascal}${conceptName}Accounts,`);
  lines.push(`): ActionInstruction {`);
  lines.push(`  return compileInstruction(`);
  lines.push(`    "${programId}",`);
  lines.push(`    ${ixPascal.toUpperCase()}_${conceptName.toUpperCase()}_IX,`);
  lines.push(`    params as unknown as Record<string, unknown>,`);
  lines.push(`    accounts as unknown as Record<string, string>,`);
  lines.push(`  );`);
  lines.push(`}`);

  return lines.join("\n");
}

/** Import line for generated files that use the SDK instruction compiler. */
export const SDK_COMPILER_IMPORT =
  'import { compileInstruction, type ActionInstruction } from "@solana-ontology/sdk";';

/** Normalize an instruction/transition name for matching (case & separators). */
function normalizeIxName(name: string): string {
  return name.replace(/[_\s]/g, "").toLowerCase();
}

/**
 * Generate an action builder function for a state machine transition.
 *
 * When the transition's instruction matches the concept's idlInstruction
 * data, the action delegates to the real typed instruction builder. Other
 * transitions get a function that throws an explicit "no IDL data in the
 * ontology" error — building them is unsupported, not unimplemented.
 */
function generateTransitionAction(concept: Concept, transition: StateTransition): string {
  const conceptName = concept.canonicalName;
  const fnName = `build${transition.from}To${transition.to}Via${transition.via}${conceptName}Action`;

  const ref = concept.idlInstruction;
  const matchesIx =
    hasInstructionData(concept) &&
    normalizeIxName(ref!.instructionName!) === normalizeIxName(transition.via);

  if (matchesIx) {
    const ixPascal = toPascal(ref!.instructionName!);
    return [
      `/**`,
      ` * Build the ${conceptName} state transition action:`,
      ` * ${transition.from} → ${transition.to} via ${transition.via}`,
      ` */`,
      `export function ${fnName}(`,
      `  params: ${ixPascal}${conceptName}Params,`,
      `  accounts: ${ixPascal}${conceptName}Accounts,`,
      `): ActionInstruction {`,
      `  return build${ixPascal}${conceptName}Instruction(params, accounts);`,
      `}`,
    ].join("\n");
  }

  return [
    `/**`,
    ` * The ${transition.via} transition (${transition.from} → ${transition.to}) has no`,
    ` * IDL instruction data in the ontology, so a typed builder cannot be generated.`,
    ` * Regenerate concepts from the program IDL (\`solana-ontology idl <program.json>\`)`,
    ` * or add \`idlInstruction.args\`/\`accounts\` to the concept to enable it.`,
    ` */`,
    `export function ${fnName}(): never {`,
    `  throw new Error(`,
    `    "${fnName}: no IDL instruction data for transition ${transition.via} in the ontology — regenerate concepts from the program IDL to enable this builder",`,
    `  );`,
    `}`,
  ].join("\n");
}

/**
 * Generate all action builders for a concept's state machine.
 */
export function generateActions(concept: Concept): string[] {
  if (!concept.stateMachine?.transitions) return [];

  // Dedupe fully-identical transitions so the emitted module never contains
  // duplicate function declarations
  const seen = new Set<string>();
  const actions: string[] = [];
  for (const t of concept.stateMachine.transitions) {
    const key = `${t.from}→${t.to}→${t.via}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(generateTransitionAction(concept, t));
  }
  return actions;
}

/**
 * Generate a state enum for a concept's state machine.
 */
export function generateStateEnum(concept: Concept): string | null {
  if (!concept.stateMachine?.states) return null;

  const name = concept.canonicalName;
  const states = concept.stateMachine.states;

  const lines: string[] = [];
  lines.push(`export enum ${name}State {`);
  for (const state of states) {
    lines.push(`  ${state} = "${state}",`);
  }
  lines.push(`}`);
  return lines.join("\n");
}
