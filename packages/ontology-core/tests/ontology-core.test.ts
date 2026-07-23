import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConcepts } from "../src/loader.js";
import { validateAll, validateConcept } from "../src/validator.js";
import { buildGraph, getDependencies } from "../src/graph.js";
import { SOLANA_PROGRAM_IDS, getProgramId, findProgramIdByAddress } from "../src/program-ids.js";
import type { Concept } from "../src/types.js";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ONTOLOGY_ROOT = join(PROJECT_ROOT, "ontology");
const CONCEPTS_DIR = join(ONTOLOGY_ROOT, "concepts");

describe("loader", () => {
  it("should load all concept YAML files", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    expect(concepts.length).toBe(38);
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
  it("should validate all seed concepts without errors", () => {
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
    expect(result.errors.some((e) => e.message.includes("NonExistentConcept"))).toBe(true);
  });
});

describe("graph", () => {
  it("should build a graph with all concepts as nodes", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const graph = buildGraph(concepts);
    expect(graph.nodes.size).toBe(38);
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
    expect(totalNodes).toBe(38);
  });

  it("should find dependencies for Account", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const graph = buildGraph(concepts);
    const deps = getDependencies(graph, "Account");
    expect(deps).toContain("Program");
    expect(deps).toContain("PDA");
  });
});

describe("on-chain linkage fields", () => {
  it("should validate concepts with programId and accountLayout", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const tokenMint = concepts.find((c) => c.canonicalName === "TokenMint");
    expect(tokenMint).toBeDefined();
    expect(tokenMint!.programId).toBe(SOLANA_PROGRAM_IDS.Token);
    expect(tokenMint!.tokenStandard).toBe("spl");
    expect(tokenMint!.accountLayout).toBeDefined();
    expect(tokenMint!.accountLayout!.discriminator).toBe("0000000000000000");
    expect(tokenMint!.accountLayout!.fields.length).toBeGreaterThan(0);
    // Verify COption offsets are correct
    const supplyField = tokenMint!.accountLayout!.fields.find((f) => f.name === "supply");
    expect(supplyField).toBeDefined();
    expect(supplyField!.offset).toBe(36);
    const decimalsField = tokenMint!.accountLayout!.fields.find((f) => f.name === "decimals");
    expect(decimalsField).toBeDefined();
    expect(decimalsField!.offset).toBe(44);
  });

  it("should validate TokenAccount has accountLayout with correct fields and offsets", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const tokenAccount = concepts.find((c) => c.canonicalName === "TokenAccount");
    expect(tokenAccount).toBeDefined();
    expect(tokenAccount!.programId).toBe(SOLANA_PROGRAM_IDS.Token);
    expect(tokenAccount!.accountLayout).toBeDefined();
    const amountField = tokenAccount!.accountLayout!.fields.find((f) => f.name === "amount");
    expect(amountField).toBeDefined();
    expect(amountField!.type).toBe("u64");
    expect(amountField!.offset).toBe(64);
    // Verify COption offsets are correct
    const delegatedAmountField = tokenAccount!.accountLayout!.fields.find((f) => f.name === "delegatedAmount");
    expect(delegatedAmountField).toBeDefined();
    expect(delegatedAmountField!.offset).toBe(121);
    const closeAuthorityField = tokenAccount!.accountLayout!.fields.find((f) => f.name === "closeAuthority");
    expect(closeAuthorityField).toBeDefined();
    expect(closeAuthorityField!.offset).toBe(129);
  });

  it("should validate TokenExtension has token2022 standard", () => {
    const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    const tokenExt = concepts.find((c) => c.canonicalName === "TokenExtension");
    expect(tokenExt).toBeDefined();
    expect(tokenExt!.tokenStandard).toBe("token2022");
    expect(tokenExt!.programId).toBe(SOLANA_PROGRAM_IDS.Token2022);
  });

  it("should reject tokenStandard on non-token category", () => {
    const concept: Concept = {
      canonicalName: "TestConcept",
      purpose: "Test concept with invalid tokenStandard",
      category: "primitive",
      version: "1.0.0",
      tokenStandard: "spl",
    };
    const result = validateConcept(concept);
    // Schema validation passes (tokenStandard is valid string), but semantic check should catch it
    const allResult = validateAll([concept]);
    expect(allResult.errors.some((e) => e.message.includes("tokenStandard"))).toBe(true);
  });

  it("should reject invalid discriminator format via schema", () => {
    const concept: Concept = {
      canonicalName: "TestDiscriminator",
      purpose: "Test concept with invalid discriminator format",
      category: "token",
      version: "1.0.0",
      accountLayout: {
        discriminator: "xyz123",
        fields: [{ name: "test", type: "u8" }],
      },
    };
    const result = validateConcept(concept);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path?.includes("discriminator"))).toBe(true);
  });

  it("should reject duplicate pdaSeeds names", () => {
    const concept: Concept = {
      canonicalName: "TestPdaSeeds",
      purpose: "Test concept with duplicate PDA seed names",
      category: "primitive",
      version: "1.0.0",
      pdaSeeds: [
        { name: "mint", type: "publicKey" },
        { name: "mint", type: "u8" },
      ],
    };
    const allResult = validateAll([concept]);
    expect(allResult.errors.some((e) => e.message.includes("Duplicate PDA seed"))).toBe(true);
  });
});

describe("program-ids", () => {
  it("should export well-known Solana program IDs", () => {
    expect(SOLANA_PROGRAM_IDS.System).toBe("11111111111111111111111111111111");
    expect(SOLANA_PROGRAM_IDS.Token).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    expect(SOLANA_PROGRAM_IDS.Token2022).toBe("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    expect(SOLANA_PROGRAM_IDS.ComputeBudget).toBe("ComputeBudget111111111111111111111111111111");
    expect(SOLANA_PROGRAM_IDS.Ed25519).toBe("Ed25519SigVerify111111111111111111111111111");
  });

  it("should get program ID by name", () => {
    expect(getProgramId("Token")).toBe(SOLANA_PROGRAM_IDS.Token);
    expect(getProgramId("Token2022")).toBe(SOLANA_PROGRAM_IDS.Token2022);
  });

  it("should find program ID by address", () => {
    expect(findProgramIdByAddress(SOLANA_PROGRAM_IDS.Token)).toBe("Token");
    expect(findProgramIdByAddress(SOLANA_PROGRAM_IDS.Token2022)).toBe("Token2022");
    expect(findProgramIdByAddress("UnknownAddress123")).toBeNull();
  });
});
