import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadConcepts } from "../src/loader.js";
import { validateAll, validateConcept } from "../src/validator.js";
import { buildGraph, getDependencies } from "../src/graph.js";
import type { Concept } from "../src/types.js";

const ONTOLOGY_ROOT = join(process.cwd(), "ontology");
const CONCEPTS_DIR = join(ONTOLOGY_ROOT, "concepts");

describe("loader", () => {
  it("should load all 34 concept YAML files", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    expect(concepts.length).toBe(34);
  });

  it("should set _sourceFile on each concept", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    for (const concept of concepts) {
      expect(concept._sourceFile).toBeDefined();
      expect(concept._sourceFile).toMatch(/\.yaml$/);
    }
  });

  it("should load concepts from all 6 categories", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const categories = new Set(concepts.map((c) => c.category));
    expect(categories.has("primitive")).toBe(true);
    expect(categories.has("token")).toBe(true);
    expect(categories.has("defi")).toBe(true);
    expect(categories.has("governance")).toBe(true);
    expect(categories.has("infrastructure")).toBe(true);
    expect(categories.has("delivery")).toBe(true);
  });
});

describe("validator", () => {
  it("should validate all 34 seed concepts without errors", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const result = validateAll(concepts);
    if (!result.valid) {
      console.error("Validation errors:", result.errors);
    }
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should reject a concept with missing required fields", () => {
    const invalid = {
      canonicalName: "TestConcept",
      // missing purpose, category, version
    } as unknown as Concept;
    const result = validateConcept(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should detect duplicate canonical names", () => {
    const concepts: Concept[] = [
      {
        canonicalName: "Duplicate",
        purpose: "First one",
        category: "primitive",
        version: "1.0.0",
      },
      {
        canonicalName: "Duplicate",
        purpose: "Second one",
        category: "primitive",
        version: "1.0.0",
      },
    ];
    const result = validateAll(concepts);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("should detect dangling relationship targets", () => {
    const concepts: Concept[] = [
      {
        canonicalName: "ConceptA",
        purpose: "Test concept A",
        category: "primitive",
        version: "1.0.0",
        relationships: [
          {
            type: "ownedBy",
            target: "NonExistentConcept",
            cardinality: "1:1",
          },
        ],
      },
    ];
    const result = validateAll(concepts);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes("NonExistentConcept")),
    ).toBe(true);
  });
});

describe("graph", () => {
  it("should build a graph with all concepts as nodes", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const graph = buildGraph(concepts);
    expect(graph.nodes.size).toBe(34);
  });

  it("should detect orphans (concepts not referenced by others)", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const graph = buildGraph(concepts);
    expect(graph.orphans.length).toBeGreaterThan(0);
  });

  it("should compute connected components", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const graph = buildGraph(concepts);
    expect(graph.components.length).toBeGreaterThan(0);
    const totalNodes = graph.components.reduce((sum, c) => sum + c.length, 0);
    expect(totalNodes).toBe(34);
  });

  it("should find dependencies for Account", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const graph = buildGraph(concepts);
    const deps = getDependencies(graph, "Account");
    expect(deps).toContain("Program");
    expect(deps).toContain("PDA");
  });
});
