import { describe, it, expect } from "vitest";
import { loadConcepts, validateAll, validateConcept, type Concept } from "@solana-ontology/core";
import {
  isIdlV0,
  migrateIdlV0ToV1,
  generateConceptsFromIdl,
  type IdlV0,
} from "@solana-ontology/idl-parser";
import { OntologyOmsServer } from "@solana-ontology/oms";
import { OntologyMcpServer } from "@solana-ontology/mcp-server";
import { generateClientFiles } from "@solana-ontology/generator-client";
import { resolve } from "node:path";

const ONTOLOGY_ROOT = resolve(__dirname, "../../ontology");
const CONCEPTS_DIR = resolve(ONTOLOGY_ROOT, "concepts");

// Fixture: a minimal Anchor IDL v0 for a token mint program
const fixtureIdlV0: IdlV0 = {
  version: "0.1.0",
  name: "token_mint",
  instructions: [
    {
      name: "MintToken",
      accounts: [
        { name: "mint", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
        { name: "recipient", isMut: true, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "BurnToken",
      accounts: [
        { name: "mint", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
  accounts: [
    {
      name: "MintAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "supply", type: "u64" },
          { name: "authority", type: "publicKey" },
          { name: "decimals", type: "u8" },
        ],
      },
    },
  ],
};

describe("Cross-Package Integration", () => {
  it("should exercise the full pipeline: IDL parse → concept gen → validate → OMS → MCP → client gen", async () => {
    // ── Step 1: Parse IDL v0 and codemod to v1 ──────────────────────────
    expect(isIdlV0(fixtureIdlV0)).toBe(true);

    const v1 = migrateIdlV0ToV1(fixtureIdlV0);
    expect(v1.instructions).toHaveLength(2);
    expect(v1.accounts).toHaveLength(1);
    expect(v1.instructions[0].discriminator).toBeDefined();

    // ── Step 2: Generate concepts from IDL ──────────────────────────────
    const generatedConcepts = generateConceptsFromIdl(v1, "token_mint");
    expect(generatedConcepts.length).toBeGreaterThan(0);

    // Should have a concept for the MintAccount
    const mintConcept = generatedConcepts.find((c: Concept) => c.canonicalName === "MintAccount");
    expect(mintConcept).toBeDefined();
    expect(mintConcept!.category).toBe("token");
    expect(mintConcept!.properties).toBeDefined();
    expect(mintConcept!.properties!.some((p) => p.name === "supply")).toBe(true);

    // ── Step 3: Validate generated concepts ─────────────────────────────
    for (const concept of generatedConcepts) {
      const result = validateConcept(concept);
      expect(result.valid).toBe(true);
    }

    // ── Step 4: Load seed ontology concepts and merge with generated ────
    const seedConcepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
    expect(seedConcepts.length).toBe(34);

    const allValid = validateAll(seedConcepts);
    expect(allValid.valid).toBe(true);

    // ── Step 5: Register seed concepts with OMS ─────────────────────────
    const oms = new OntologyOmsServer({ port: 0 });
    await oms.registerConcepts(seedConcepts);

    const dump = await oms.dump();
    expect(dump.objectTypes.length).toBeGreaterThan(0);
    expect(dump.linkTypes.length).toBeGreaterThan(0);
    expect(dump.actionTypes.length).toBeGreaterThan(0);

    // Verify a known concept is registered
    const tokenMint = dump.objectTypes.find((t) => t.name === "TokenMint");
    expect(tokenMint).toBeDefined();
    expect(tokenMint!.primaryKey).toBeDefined();

    // ── Step 6: Register seed concepts with MCP server ──────────────────
    const mcp = new OntologyMcpServer({ transport: "stdio" });
    mcp.registerConcepts(seedConcepts);

    const resources = mcp.listResources();
    expect(resources.length).toBeGreaterThan(0);

    // Verify a known concept is exposed as a resource
    const accountResource = resources.find((r) => r.uri === "solana-ontology://concept/Account");
    expect(accountResource).toBeDefined();
    expect(accountResource!.name).toBe("Account");

    // Verify tools are generated from state machines
    const tools = mcp.listTools();
    expect(tools.length).toBeGreaterThan(0);

    // Read a specific resource
    const content = mcp.readResource("solana-ontology://concept/TokenMint");
    expect(content).not.toBeNull();
    expect(content!.text).toContain("TokenMint");

    // ── Step 7: Generate client library from seed concepts ──────────────
    const clientFiles = generateClientFiles(seedConcepts, {
      outputDir: "./generated/client",
      packageName: "@test/ontology-client",
      generateReact: true,
      generateQueries: true,
    });

    expect(clientFiles.length).toBeGreaterThan(0);

    // Verify ObjectTypes.ts was generated
    const objectTypesFile = clientFiles.find((f) => f.path === "ObjectTypes.ts");
    expect(objectTypesFile).toBeDefined();
    expect(objectTypesFile!.content).toContain("interface");
    expect(objectTypesFile!.content).toContain("TokenMint");

    // Verify ActionTypes.ts was generated
    const actionTypesFile = clientFiles.find((f) => f.path === "ActionTypes.ts");
    expect(actionTypesFile).toBeDefined();

    // Verify Client.ts was generated
    const clientFile = clientFiles.find((f) => f.path === "Client.ts");
    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain("class");

    // Verify Queries.ts was generated (since generateQueries: true)
    const queriesFile = clientFiles.find((f) => f.path === "Queries.ts");
    expect(queriesFile).toBeDefined();

    // Verify Hooks.ts was generated (since generateReact: true)
    const hooksFile = clientFiles.find((f) => f.path === "Hooks.ts");
    expect(hooksFile).toBeDefined();
    expect(hooksFile!.content).toContain("useEffect");

    // Verify index.ts barrel was generated
    const indexFile = clientFiles.find((f) => f.path === "index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("export");

    // ── Step 8: Verify MCP blocks destructive actions without approval ──
    const destructiveTool = tools.find((t) => t.annotations?.destructive === true);
    if (destructiveTool) {
      const result = mcp.callTool(destructiveTool.name, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("approval");
    }
  });

  it("should generate concepts from IDL and register them with OMS", async () => {
    // Parse and codemod
    const v1 = migrateIdlV0ToV1(fixtureIdlV0);
    const concepts = generateConceptsFromIdl(v1, "token_mint");

    // Register with OMS
    const oms = new OntologyOmsServer({ port: 0 });
    await oms.registerConcepts(concepts);

    const dump = await oms.dump();
    // Should have object types for the generated concepts
    expect(dump.objectTypes.length).toBeGreaterThan(0);

    // The MintAccount concept should be registered
    const mintAccount = dump.objectTypes.find((t) => t.name === "MintAccount");
    expect(mintAccount).toBeDefined();
  });

  it("should expose generated concepts as MCP resources", () => {
    const v1 = migrateIdlV0ToV1(fixtureIdlV0);
    const concepts = generateConceptsFromIdl(v1, "token_mint");

    const mcp = new OntologyMcpServer({ transport: "stdio" });
    mcp.registerConcepts(concepts);

    const resources = mcp.listResources();
    expect(resources.length).toBeGreaterThan(0);

    // Each concept should have a resource URI
    for (const r of resources) {
      expect(r.uri).toMatch(/^solana-ontology:\/\/concept\//);
    }
  });
});
