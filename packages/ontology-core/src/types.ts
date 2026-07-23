export type ConceptCategory =
  "primitive" | "token" | "defi" | "governance" | "infrastructure" | "delivery" | "security" | "fuzzing";

export type RelationshipType =
  | "ownedBy"
  | "derivedFrom"
  | "cpiTo"
  | "versionOf"
  | "contains"
  | "references"
  | "extends"
  | "dependsOn";

export type Cardinality =
  "1:1" | "1:many" | "many:1" | "many:many" | "0:1" | "0:many" | "2:1" | "n:1" | "1:n";

export interface ConceptProperty {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface ConceptRelationship {
  type: RelationshipType;
  target: string;
  cardinality: Cardinality;
  description?: string;
}

export interface StateTransition {
  from: string;
  to: string;
  via: string;
  /** Required signer authority for this transition (security check) */
  requiresAuth?: string;
  /** Precondition expression that must hold before transition */
  requires?: string;
}

export interface StateMachine {
  states: string[];
  transitions: StateTransition[];
}

export interface ConceptConstraint {
  name?: string;
  expression: string;
  description: string;
}

export interface ConceptLink {
  label: string;
  url: string;
}

// ── On-chain linkage types ─────────────────────────────────────────────────

export interface PdaSeedDef {
  name: string;
  type: "string" | "u8" | "u32" | "u64" | "publicKey" | "bytes";
  description?: string;
}

export interface BorshFieldDef {
  name: string;
  type: string;
  offset?: number;
  description?: string;
}

export interface AccountLayoutDef {
  discriminator?: string;
  fields: BorshFieldDef[];
}

export interface IdlInstructionRef {
  programId?: string;
  instructionName?: string;
  discriminator?: string;
}

export type TokenStandard = "spl" | "token2022";

export interface ConceptLinksObject {
  docs?: string[];
  anchorIdl?: string;
  auditReports?: string[];
}

export interface Concept {
  canonicalName: string;
  aliases?: string[];
  purpose: string;
  category: ConceptCategory;
  version: string;
  owner?: string;
  properties?: ConceptProperty[];
  relationships?: ConceptRelationship[];
  stateMachine?: StateMachine;
  constraints?: ConceptConstraint[];
  links?: ConceptLink[] | ConceptLinksObject;
  /** Formal PDA seed structure for type-safe derivation */
  pdaSeeds?: PdaSeedDef[];
  /** Borsh account layout for on-chain decoding */
  accountLayout?: AccountLayoutDef;
  /** Default on-chain program ID (base58) */
  programId?: string;
  /** Link to IDL instruction for code generation */
  idlInstruction?: IdlInstructionRef;
  /** Token program variant (only valid for category: token) */
  tokenStandard?: TokenStandard;
  /** Security: required authority field name for signing (e.g. "authority", "admin") */
  requiredAuth?: string;
  /** Security: whether this concept requires owner verification on accounts */
  requireOwnerCheck?: boolean;
  /** File path relative to the ontology root, set by the loader */
  _sourceFile?: string;
}

export interface OntologyGraph {
  /** Map of concept name to concept */
  nodes: Map<string, Concept>;
  /** Adjacency list: concept name -> outgoing edges */
  edges: Map<string, ConceptRelationship[]>;
  /** Concepts that no other concept references */
  orphans: string[];
  /** Connected components as arrays of concept names */
  components: string[][];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  file: string;
  conceptName?: string;
  message: string;
  path?: string;
}

export interface ValidationWarning {
  file: string;
  conceptName?: string;
  message: string;
  path?: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}
