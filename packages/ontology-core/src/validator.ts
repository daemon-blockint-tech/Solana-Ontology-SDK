import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { schema } from "./schema.js";
import type { Concept, ValidationResult, ValidationError } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema as Record<string, unknown>);

/**
 * Validate a single concept against the ontology JSON schema.
 */
export function validateConcept(concept: Concept): ValidationResult {
  const errors: ValidationError[] = [];
  // Strip internal fields before schema validation
  const { _sourceFile, ...conceptData } = concept as Concept & { _sourceFile?: string };
  const valid = validate(conceptData);
  if (!valid && validate.errors) {
    for (const err of validate.errors as ErrorObject[]) {
      errors.push({
        file: _sourceFile ?? "<unknown>",
        conceptName: concept.canonicalName,
        message: err.message ?? "Validation error",
        path: err.instancePath || err.schemaPath,
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an array of concepts and check for:
 * - Schema compliance
 * - Duplicate canonical names
 * - Relationship targets that don't exist in the set
 */
export function validateAll(concepts: Concept[]): ValidationResult {
  const errors: ValidationError[] = [];
  const names = new Set<string>();

  for (const concept of concepts) {
    const result = validateConcept(concept);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    if (names.has(concept.canonicalName)) {
      errors.push({
        file: concept._sourceFile ?? "<unknown>",
        conceptName: concept.canonicalName,
        message: `Duplicate canonical name: "${concept.canonicalName}"`,
      });
    }
    names.add(concept.canonicalName);
  }

  for (const concept of concepts) {
    if (!concept.relationships) continue;
    for (const rel of concept.relationships) {
      if (!names.has(rel.target)) {
        errors.push({
          file: concept._sourceFile ?? "<unknown>",
          conceptName: concept.canonicalName,
          message: `Relationship target "${rel.target}" does not exist in the ontology`,
          path: `relationships.${rel.type}`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
