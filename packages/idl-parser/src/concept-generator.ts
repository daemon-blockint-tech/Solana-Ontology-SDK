import type {
  IdlV1,
  IdlV1Account,
  IdlV1Field,
  IdlV1Instruction,
  IdlV1Type,
} from "./types.js";
import type {
  Concept,
  ConceptProperty,
  ConceptRelationship,
  StateMachine,
  StateTransition,
  ConceptCategory,
} from "@solana-ontology/core";

/**
 * Map an Anchor IDL type string to our ontology type system.
 */
export function mapIdlTypeToOntology(idlType: string | IdlV1Type): string {
  if (typeof idlType === "string") {
    const primitiveMap: Record<string, string> = {
      bool: "bool",
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
      pubkey: "Address",
      string: "string",
      bytes: "bytes",
      void: "void",
    };
    return primitiveMap[idlType] ?? idlType;
  }

  if (idlType.defined) return idlType.defined;
  if (idlType.option) {
    const inner = typeof idlType.option === "string" ? idlType.option : mapIdlTypeToOntology(idlType.option);
    return `Option<${inner}>`;
  }
  if (idlType.vec) {
    const inner = typeof idlType.vec === "string" ? idlType.vec : mapIdlTypeToOntology(idlType.vec);
    return `Vec<${inner}>`;
  }
  if (idlType.array) {
    const inner = typeof idlType.array[0] === "string" ? idlType.array[0] : mapIdlTypeToOntology(idlType.array[0]);
    return `Array<${inner}, ${idlType.array[1]}>`;
  }
  if (idlType.pubkey) return "Address";
  return "unknown";
}

/**
 * Detect if a field type is a Pubkey (potential relationship).
 */
function isPubkeyField(type: string | IdlV1Type): boolean {
  if (typeof type === "string") return type === "pubkey";
  return type.pubkey === true;
}

/**
 * Infer relationships from account struct fields.
 * Any Pubkey field that matches another account name becomes a relationship.
 */
export function inferRelationships(
  account: IdlV1Account,
  allAccountNames: Set<string>,
): ConceptRelationship[] {
  const relationships: ConceptRelationship[] = [];

  for (const field of account.type.fields ?? []) {
    if (!isPubkeyField(field.type)) continue;

    // Check if the field name (snake_case) matches an account name
    const fieldName = field.name.replace(/_pubkey$|_key$|_address$/, "");
    if (allAccountNames.has(fieldName)) {
      relationships.push({
        type: "references",
        target: toPascalCase(fieldName),
        cardinality: "many:1",
        description: `${toPascalCase(account.name)} references a ${toPascalCase(fieldName)} via ${field.name}`,
      });
    }
  }

  return relationships;
}

/**
 * Generate state machine transitions from IDL instructions.
 * Each instruction that modifies an account becomes a transition.
 */
export function generateStateTransitions(
  idl: IdlV1,
  accountName: string,
): StateMachine | undefined {
  const relevantInstructions = idl.instructions.filter((ix) =>
    ix.accounts.some((acc) => acc.name === accountName || acc.name === convertCamelToSnakeMatch(accountName)),
  );

  if (relevantInstructions.length === 0) return undefined;

  const states = ["Uninitialized", "Active"];
  const transitions: StateTransition[] = [];

  for (const ix of relevantInstructions) {
    // Heuristic: if instruction name contains "initialize" or "create", it's Uninitialized→Active
    if (ix.name.includes("init") || ix.name.includes("create")) {
      transitions.push({
        from: "Uninitialized",
        to: "Active",
        via: toPascalCase(ix.name),
      });
    } else if (ix.name.includes("close") || ix.name.includes("delete")) {
      transitions.push({
        from: "Active",
        to: "Uninitialized",
        via: toPascalCase(ix.name),
      });
    } else {
      // General state-preserving transition
      transitions.push({
        from: "Active",
        to: "Active",
        via: toPascalCase(ix.name),
      });
    }
  }

  if (transitions.length === 0) return undefined;

  return { states, transitions };
}

/**
 * Generate ontology concepts from a parsed IDL v1.
 * Each account struct becomes a concept with properties, relationships, and state machine.
 */
export function generateConceptsFromIdl(idl: IdlV1): Concept[] {
  const concepts: Concept[] = [];
  const accountNames = new Set(idl.accounts.map((a) => a.name));

  for (const account of idl.accounts) {
    const pascalName = toPascalCase(account.name);
    const properties: ConceptProperty[] = (account.type.fields ?? []).map((field: IdlV1Field) => ({
      name: field.name,
      type: mapIdlTypeToOntology(field.type),
      required: !field.attrs?.includes("optional"),
      description: `${field.name} field of ${pascalName}`,
    }));

    const relationships = inferRelationships(account, accountNames);
    const stateMachine = generateStateTransitions(idl, account.name);

    const concept: Concept = {
      canonicalName: pascalName,
      purpose: `On-chain ${pascalName} account defined by ${idl.metadata.name} program`,
      category: inferCategory(pascalName),
      version: idl.metadata.version,
      owner: idl.metadata.name,
      properties,
      relationships: relationships.length > 0 ? relationships : undefined,
      stateMachine,
      constraints: [
        {
          name: "discriminator_check",
          expression: `first 8 bytes must equal [${account.discriminator.join(", ")}]`,
          description: "Anchor account discriminator must match",
        },
      ],
      links: [
        {
          label: "Program",
          url: `https://solana.fm/address/${idl.address}`,
        } as never,
      ],
    };

    concepts.push(concept);
  }

  return concepts;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toPascalCase(snake: string): string {
  return snake
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function convertCamelToSnakeMatch(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function inferCategory(name: string): ConceptCategory {
  const lower = name.toLowerCase();
  if (lower.includes("token") || lower.includes("mint") || lower.includes("nft")) return "token";
  if (lower.includes("pool") || lower.includes("vault") || lower.includes("swap") || lower.includes("lending") || lower.includes("position") || lower.includes("oracle")) return "defi";
  if (lower.includes("proposal") || lower.includes("vote") || lower.includes("multisig") || lower.includes("dao") || lower.includes("stake")) return "governance";
  if (lower.includes("cluster") || lower.includes("slot") || lower.includes("epoch") || lower.includes("validator")) return "infrastructure";
  if (lower.includes("release") || lower.includes("deploy") || lower.includes("upgrade")) return "delivery";
  return "primitive";
}
