import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { schema } from "./schema.js";
import type { Concept, ValidationResult, ValidationError, ValidationWarning } from "./types.js";

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
  return { valid: errors.length === 0, errors, warnings: [] };
}

/**
 * Validate an array of concepts and check for:
 * - Schema compliance
 * - Duplicate canonical names
 * - Relationship targets that don't exist in the set
 * - Security vulnerability patterns (as warnings)
 */
export function validateAll(concepts: Concept[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const names = new Set<string>();

  for (const concept of concepts) {
    const result = validateConcept(concept);
    if (!result.valid) {
      errors.push(...result.errors);
    }

    // Semantic: tokenStandard only valid for token category
    if (concept.tokenStandard && concept.category !== "token") {
      errors.push({
        file: concept._sourceFile ?? "<unknown>",
        conceptName: concept.canonicalName,
        message: `tokenStandard is only valid for category "token", got "${concept.category}"`,
        path: "tokenStandard",
      });
    }

    // Semantic: pdaSeeds names must be unique
    if (concept.pdaSeeds) {
      const seedNames = new Set<string>();
      for (const seed of concept.pdaSeeds) {
        if (seedNames.has(seed.name)) {
          errors.push({
            file: concept._sourceFile ?? "<unknown>",
            conceptName: concept.canonicalName,
            message: `Duplicate PDA seed name: "${seed.name}"`,
            path: "pdaSeeds",
          });
        }
        seedNames.add(seed.name);
      }
    }

    // ── Security validation rules (warnings, not errors) ──────────────

    // Rule 1: missing_auth — concept has stateMachine transitions but no requiredAuth
    if (concept.stateMachine?.transitions?.length && !concept.requiredAuth) {
      warnings.push({
        file: concept._sourceFile ?? "<unknown>",
        conceptName: concept.canonicalName,
        message: `Concept has state transitions but no requiredAuth — transitions are unprotected (missing signer check)`,
        path: "requiredAuth",
        severity: "CRITICAL",
      });
    }

    // Rule 2: missing_program_id — concept has accountLayout but no programId
    if (concept.accountLayout && !concept.programId) {
      warnings.push({
        file: concept._sourceFile ?? "<unknown>",
        conceptName: concept.canonicalName,
        message: `Account layout defined without programId — owner check bypass risk`,
        path: "programId",
        severity: "HIGH",
      });
    }

    // Rule 3: untyped_pda_seeds — pdaSeeds all string type (no publicKey)
    if (concept.pdaSeeds?.length) {
      const hasPublicKey = concept.pdaSeeds.some((s) => s.type === "publicKey");
      if (!hasPublicKey && concept.pdaSeeds.length > 1) {
        warnings.push({
          file: concept._sourceFile ?? "<unknown>",
          conceptName: concept.canonicalName,
          message: `PDA seeds contain no publicKey type — account substitution risk`,
          path: "pdaSeeds",
          severity: "MEDIUM",
        });
      }
    }

    // Rule 4: missing_token_standard — token category concept without tokenStandard
    if (concept.category === "token" && !concept.tokenStandard) {
      warnings.push({
        file: concept._sourceFile ?? "<unknown>",
        conceptName: concept.canonicalName,
        message: `Token concept without tokenStandard — SPL/Token-2022 confusion risk`,
        path: "tokenStandard",
        severity: "MEDIUM",
      });
    }

    // Rule 5: open_transition — transition without requires precondition
    if (concept.stateMachine?.transitions) {
      for (const t of concept.stateMachine.transitions) {
        if (!t.requires && !t.requiresAuth) {
          warnings.push({
            file: concept._sourceFile ?? "<unknown>",
            conceptName: concept.canonicalName,
            message: `Transition "${t.from}→${t.to}" via "${t.via}" has no requires or requiresAuth — race condition risk`,
            path: `stateMachine.transitions.${t.via}`,
            severity: "HIGH",
          });
        }
      }
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

  return { valid: errors.length === 0, errors, warnings };
}
