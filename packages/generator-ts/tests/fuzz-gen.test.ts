import { describe, it, expect } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import {
  generateTridentFuzzTest,
  generateAllTridentFuzzTests,
  generateTridentConfig,
  extractFuzzConcepts,
} from "../src/index.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ONTOLOGY_ROOT = join(PROJECT_ROOT, "ontology");
const CONCEPTS_DIR = join(ONTOLOGY_ROOT, "concepts");

describe("fuzz-gen: Trident fuzz test generation", () => {
  const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);

  it("should load 3 fuzzing concepts", () => {
    const fuzzConcepts = concepts.filter((c) => c.category === "fuzzing");
    expect(fuzzConcepts.length).toBe(3);
    expect(fuzzConcepts.map((c) => c.canonicalName)).toContain("FuzzStrategy");
    expect(fuzzConcepts.map((c) => c.canonicalName)).toContain("FuzzFlow");
    expect(fuzzConcepts.map((c) => c.canonicalName)).toContain("FuzzInvariant");
  });

  it("should extract fuzzing concepts by type", () => {
    const { strategies, flows, invariants } = extractFuzzConcepts(concepts);
    expect(strategies.length).toBe(1);
    expect(flows.length).toBe(1);
    expect(invariants.length).toBe(1);
  });

  it("should find fuzzable concepts with stateMachine", () => {
    const scaffolds = generateAllTridentFuzzTests(concepts);
    // Concepts with stateMachine transitions should produce fuzz tests
    expect(scaffolds.length).toBeGreaterThan(0);

    for (const s of scaffolds) {
      expect(s.filename).toMatch(/_fuzz\.rs$/);
      expect(s.content).toContain("#[init]");
      expect(s.content).toContain("#[flow]");
    }
  });

  it("should generate #[init] function with initial state", () => {
    const concept = concepts.find((c) => c.canonicalName === "Vault");
    if (!concept) return; // skip if no Vault concept

    const fuzzTest = generateTridentFuzzTest(concept);
    expect(fuzzTest).toContain("#[init]");
    expect(fuzzTest).toContain("fn start");
    expect(fuzzTest).toContain("execute_transaction");
  });

  it("should generate #[flow] functions for each transition", () => {
    const concept = concepts.find(
      (c) => c.stateMachine && c.stateMachine.transitions.length > 0,
    );
    if (!concept) return;

    const fuzzTest = generateTridentFuzzTest(concept);
    const transitionCount = concept.stateMachine!.transitions.length;
    const flowCount = (fuzzTest.match(/#\[flow\]/g) ?? []).length;
    expect(flowCount).toBe(transitionCount);
  });

  it("should generate #[invariant] functions for constraints", () => {
    const concept = concepts.find(
      (c) => c.constraints && c.constraints.length > 0 && c.stateMachine,
    );
    if (!concept) return;

    const fuzzTest = generateTridentFuzzTest(concept);
    const constraintCount = concept.constraints!.length;
    const invariantCount = (fuzzTest.match(/#\[invariant\]/g) ?? []).length;
    expect(invariantCount).toBe(constraintCount);
  });

  it("should generate transaction builder structs", () => {
    const concept = concepts.find(
      (c) => c.stateMachine && c.stateMachine.transitions.length > 0,
    );
    if (!concept) return;

    const fuzzTest = generateTridentFuzzTest(concept);
    expect(fuzzTest).toContain("Transaction");
    expect(fuzzTest).toContain("struct");
    expect(fuzzTest).toContain("build");
  });

  it("should include auth randomization comments for secured transitions", () => {
    const concept = concepts.find(
      (c) =>
        c.stateMachine?.transitions.some((t) => t.requiresAuth),
    );
    if (!concept) return;

    const fuzzTest = generateTridentFuzzTest(concept);
    expect(fuzzTest).toContain("Auth required");
    expect(fuzzTest).toContain("randomize");
  });

  it("should generate Trident.toml config with flow weights", () => {
    const concept = concepts.find(
      (c) => c.stateMachine && c.stateMachine.transitions.length > 0,
    );
    if (!concept) return;

    const config = generateTridentConfig(concept);
    expect(config).toContain("[fuzz]");
    expect(config).toContain("iterations");
    expect(config).toContain("[fuzz.flows]");
    expect(config).toContain("_flow = 1");
  });

  it("should produce valid Rust function names", () => {
    const scaffolds = generateAllTridentFuzzTests(concepts);
    for (const s of scaffolds) {
      // filename should be snake_case_fuzz.rs
      expect(s.filename).toMatch(/^[a-z][a-z0-9_]*_fuzz\.rs$/);
    }
  });
});
