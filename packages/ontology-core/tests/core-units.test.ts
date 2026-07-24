import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConcepts, loadConcept } from "../src/loader.js";
import { validateConcept, validateAll } from "../src/validator.js";
import { buildGraph, getDependencies, getDependents } from "../src/graph.js";
import { SOLANA_PROGRAM_IDS, getProgramId, findProgramIdByAddress } from "../src/program-ids.js";
import type { Concept } from "../src/types.js";

/** Minimal schema-valid concept builder — override fields per test. */
function makeConcept(overrides: Partial<Concept> = {}): Concept {
  return {
    canonicalName: "Widget",
    aliases: [],
    purpose: "A test concept",
    category: "primitive",
    version: "1.0.0",
    owner: "test",
    ...overrides,
  } as Concept;
}

describe("validator — validateConcept (schema)", () => {
  it("accepts a minimal valid concept", () => {
    const result = validateConcept(makeConcept());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a concept missing a required field", () => {
    const bad = makeConcept();
    // canonicalName is required by the schema
    delete (bad as Partial<Concept>).canonicalName;
    const result = validateConcept(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports the source file on a validation error", () => {
    const bad = makeConcept({ _sourceFile: "concepts/bad.yaml" });
    delete (bad as Partial<Concept>).category;
    const result = validateConcept(bad);
    expect(result.valid).toBe(false);
    expect(result.errors[0].file).toBe("concepts/bad.yaml");
  });
});

describe("validator — validateAll (semantic)", () => {
  it("flags tokenStandard on a non-token category as an error", () => {
    const result = validateAll([
      makeConcept({ category: "defi", tokenStandard: "spl" } as Partial<Concept>),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("tokenStandard"))).toBe(true);
  });

  it("flags duplicate canonical names", () => {
    const result = validateAll([makeConcept(), makeConcept()]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate canonical name"))).toBe(true);
  });

  it("flags a relationship target that does not exist", () => {
    const result = validateAll([
      makeConcept({
        relationships: [{ type: "ownedBy", target: "Ghost", cardinality: "1:1" }],
      } as Partial<Concept>),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"Ghost" does not exist'))).toBe(true);
  });

  it("resolves a relationship target that does exist", () => {
    const result = validateAll([
      makeConcept({
        canonicalName: "Child",
        relationships: [{ type: "ownedBy", target: "Parent", cardinality: "1:1" }],
      } as Partial<Concept>),
      makeConcept({ canonicalName: "Parent" }),
    ]);
    expect(result.errors.some((e) => e.message.includes("does not exist"))).toBe(false);
  });

  it("emits a CRITICAL warning for transitions without requiredAuth", () => {
    const result = validateAll([
      makeConcept({
        stateMachine: {
          states: ["Idle", "Active"],
          transitions: [{ from: "Idle", to: "Active", via: "Activate" }],
        },
      } as Partial<Concept>),
    ]);
    expect(result.warnings.some((w) => w.severity === "CRITICAL")).toBe(true);
  });
});

describe("graph", () => {
  const concepts = [
    makeConcept({
      canonicalName: "A",
      relationships: [{ type: "dependsOn", target: "B", cardinality: "1:1" }],
    } as Partial<Concept>),
    makeConcept({
      canonicalName: "B",
      relationships: [{ type: "ownedBy", target: "C", cardinality: "1:1" }],
    } as Partial<Concept>),
    makeConcept({ canonicalName: "C" }),
    makeConcept({ canonicalName: "Lonely" }),
  ];

  it("registers every concept as a node", () => {
    const graph = buildGraph(concepts);
    expect(graph.nodes.size).toBe(concepts.length);
  });

  it("detects an orphan not referenced by anyone", () => {
    const graph = buildGraph(concepts);
    expect(graph.orphans).toContain("Lonely");
    expect(graph.orphans).toContain("A"); // A references others but nobody references A
    expect(graph.orphans).not.toContain("B");
  });

  it("partitions all nodes across components", () => {
    const graph = buildGraph(concepts);
    const total = graph.components.reduce((sum, c) => sum + c.length, 0);
    expect(total).toBe(graph.nodes.size);
  });

  it("getDependencies follows dependsOn/ownedBy transitively", () => {
    const graph = buildGraph(concepts);
    const deps = getDependencies(graph, "A");
    expect(deps).toContain("B");
    expect(deps).toContain("C"); // A → B (dependsOn) → C (ownedBy)
  });

  it("getDependents finds reverse ownedBy edges", () => {
    const graph = buildGraph(concepts);
    expect(getDependents(graph, "C")).toContain("B");
  });
});

describe("program-ids", () => {
  it("getProgramId returns the canonical SPL Token address", () => {
    expect(getProgramId("Token")).toBe(SOLANA_PROGRAM_IDS.Token);
  });

  it("findProgramIdByAddress round-trips a known id", () => {
    expect(findProgramIdByAddress(SOLANA_PROGRAM_IDS.System)).toBe("System");
  });

  it("findProgramIdByAddress returns null for an unknown address", () => {
    expect(findProgramIdByAddress("not-a-real-program-id")).toBeNull();
  });
});

describe("loader", () => {
  let dir: string;
  let ontologyRoot: string;
  let conceptsDir: string;

  beforeEach(() => {
    ontologyRoot = mkdtempSync(join(tmpdir(), "onto-loader-"));
    conceptsDir = join(ontologyRoot, "concepts");
    mkdirSync(join(conceptsDir, "primitive"), { recursive: true });
    dir = ontologyRoot;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("recursively loads YAML and sets a relative _sourceFile", () => {
    writeFileSync(
      join(conceptsDir, "primitive", "widget.yaml"),
      "canonicalName: Widget\ncategory: primitive\npurpose: x\nversion: 1.0.0\nowner: t\n",
    );
    const concepts = loadConcepts(conceptsDir, ontologyRoot);
    expect(concepts).toHaveLength(1);
    expect(concepts[0].canonicalName).toBe("Widget");
    expect(concepts[0]._sourceFile).toBe(join("concepts", "primitive", "widget.yaml"));
  });

  it("loadConcept reads a single file", () => {
    const file = join(conceptsDir, "primitive", "solo.yaml");
    writeFileSync(
      file,
      "canonicalName: Solo\ncategory: primitive\npurpose: x\nversion: 1.0.0\nowner: t\n",
    );
    const concept = loadConcept(file, ontologyRoot);
    expect(concept.canonicalName).toBe("Solo");
  });

  it("throws when the concepts directory does not exist", () => {
    expect(() => loadConcepts(join(ontologyRoot, "missing"), ontologyRoot)).toThrow();
  });
});
