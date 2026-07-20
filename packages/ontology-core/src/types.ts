export type ConceptCategory =
  | "primitive"
  | "token"
  | "defi"
  | "governance"
  | "infrastructure"
  | "delivery";

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
  | "1:1"
  | "1:many"
  | "many:1"
  | "many:many"
  | "0:1"
  | "0:many"
  | "2:1"
  | "n:1"
  | "1:n";

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
}

export interface ValidationError {
  file: string;
  conceptName?: string;
  message: string;
  path?: string;
}
