// ── OMS API Types ──────────────────────────────────────────────────────────

export type PropertyType =
  "String" | "Long" | "Double" | "Boolean" | "Binary" | "DateTime" | "Decimal" | "Struct" | "Array";

export interface ObjectTypeProperty {
  name: string;
  type: PropertyType;
  required: boolean;
  description?: string;
  /** Is this a derived/computed property? */
  derived?: boolean;
  /** Derivation expression (for derived properties) */
  derivationExpression?: string;
}

export interface ObjectTypeDefinition {
  name: string;
  /** Primary key property name (usually the account pubkey) */
  primaryKey: string;
  /** Index definitions for fast lookups */
  indexes?: { name: string; properties: string[]; unique: boolean }[];
  properties: ObjectTypeProperty[];
  description?: string;
  /** Source concept canonical name */
  sourceConcept?: string;
}

export interface LinkTypeDefinition {
  name: string;
  sourceType: string;
  targetType: string;
  cardinality: string;
  bidirectional: boolean;
  /** Property on source that holds the foreign key */
  sourceProperty?: string;
  description?: string;
}

export interface ActionParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface SubmissionCriteria {
  /** Required signer accounts */
  requiredSigners: string[];
  /** Required writable accounts */
  requiredWritable: string[];
  /** Validation expression */
  validationExpression?: string;
}

export interface ActionTypeDefinition {
  name: string;
  /** Object type this action modifies */
  objectType: string;
  parameters: ActionParameter[];
  submissionCriteria: SubmissionCriteria;
  /** Reference to the function that implements this action */
  functionRef?: string;
  description?: string;
}

// ── OMS Server Config ──────────────────────────────────────────────────────

export interface OmsApiConfig {
  port: number;
  /** Storage backend type */
  storage: "memory" | "sqlite" | "postgres";
  /** Database path (for sqlite) or connection string (for postgres) */
  dbPath?: string;
  /** Enable CORS */
  cors?: boolean;
  /** Auth token (if null, no auth required) */
  authToken?: string;
}

// ── External Adapter Plugin ────────────────────────────────────────────────

export interface ExternalAdapter {
  name: string;
  syncObjectTypes(types: ObjectTypeDefinition[]): Promise<void>;
  syncLinkTypes(types: LinkTypeDefinition[]): Promise<void>;
  syncActionTypes(types: ActionTypeDefinition[]): Promise<void>;
}

// ── API Response Types ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface OntologyDump {
  objectTypes: ObjectTypeDefinition[];
  linkTypes: LinkTypeDefinition[];
  actionTypes: ActionTypeDefinition[];
  conceptCount: number;
}
