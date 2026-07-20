export type {
  Concept,
  ConceptCategory,
  ConceptProperty,
  ConceptRelationship,
  ConceptConstraint,
  ConceptLinks,
  StateMachine,
  StateTransition,
  RelationshipType,
  Cardinality,
  OntologyGraph,
  ValidationResult,
  ValidationError,
} from "./types.js";

export { schema } from "./schema.js";
export { loadConcepts, loadConcept } from "./loader.js";
export { validateConcept, validateAll } from "./validator.js";
export { buildGraph, getDependencies, getDependents } from "./graph.js";
