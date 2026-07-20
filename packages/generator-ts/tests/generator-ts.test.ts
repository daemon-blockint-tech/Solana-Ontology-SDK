import { describe, it, expect } from "vitest";
import type { Concept } from "@solana-ontology/core";
import {
  generateAccountInterface,
  generateDecoder,
  mapSolanaTypeToTs,
} from "../src/account-gen.js";
import { generatePdaHelper, isPDA } from "../src/pda-gen.js";
import { generateActions, generateStateEnum } from "../src/action-gen.js";
import { generateQuery } from "../src/query-gen.js";
import { generateConceptFiles, generateIndexFile } from "../src/emitter.js";

const mockConcept: Concept = {
  canonicalName: "TestToken",
  purpose: "A test token concept for unit testing",
  category: "token",
  version: "1.0.0",
  owner: "test-team",
  properties: [
    { name: "mint", type: "Address", required: true, description: "Mint address" },
    { name: "supply", type: "u64", required: true, description: "Total supply" },
    { name: "decimals", type: "u8", required: true },
    { name: "authority", type: "Address", required: false },
  ],
  relationships: [
    { type: "ownedBy", target: "Program", cardinality: "1:1" },
    { type: "derivedFrom", target: "PDA", cardinality: "0:1" },
  ],
  stateMachine: {
    states: ["Uninitialized", "Active", "Frozen"],
    transitions: [
      { from: "Uninitialized", to: "Active", via: "Initialize" },
      { from: "Active", to: "Frozen", via: "Freeze" },
    ],
  },
};

describe("account-gen", () => {
  it("should map Solana types to TS types", () => {
    expect(mapSolanaTypeToTs("Address")).toBe("string");
    expect(mapSolanaTypeToTs("u64")).toBe("bigint");
    expect(mapSolanaTypeToTs("u8")).toBe("number");
    expect(mapSolanaTypeToTs("bool")).toBe("boolean");
    expect(mapSolanaTypeToTs("bytes")).toBe("Uint8Array");
    expect(mapSolanaTypeToTs("Address[]")).toBe("string[]");
  });

  it("should generate an interface with JSDoc", () => {
    const code = generateAccountInterface(mockConcept);
    expect(code).toContain("export interface TestToken {");
    expect(code).toContain("mint: string;");
    expect(code).toContain("supply: bigint;");
    expect(code).toContain("authority?: string;");
    expect(code).toContain("@category token");
  });

  it("should generate a decoder function", () => {
    const code = generateDecoder(mockConcept);
    expect(code).toContain("export function decodeTestToken");
    expect(code).toContain("Uint8Array");
  });
});

describe("pda-gen", () => {
  it("should detect PDA concepts", () => {
    expect(isPDA(mockConcept)).toBe(true);
  });

  it("should generate PDA helper for PDA concepts", () => {
    const code = generatePdaHelper(mockConcept);
    expect(code).not.toBeNull();
    expect(code).toContain("deriveTestTokenAddress");
  });

  it("should return null for non-PDA concepts", () => {
    const nonPda: Concept = { ...mockConcept, relationships: [] };
    expect(generatePdaHelper(nonPda)).toBeNull();
  });
});

describe("action-gen", () => {
  it("should generate state enum", () => {
    const code = generateStateEnum(mockConcept);
    expect(code).not.toBeNull();
    expect(code).toContain("export enum TestTokenState");
    expect(code).toContain('Uninitialized = "Uninitialized"');
  });

  it("should generate action builders for transitions", () => {
    const actions = generateActions(mockConcept);
    expect(actions.length).toBe(2);
    expect(actions[0]).toContain("buildUninitializedToActiveTestTokenAction");
    expect(actions[1]).toContain("buildActiveToFrozenTestTokenAction");
  });
});

describe("query-gen", () => {
  it("should generate a fetch function", () => {
    const code = generateQuery(mockConcept);
    expect(code).toContain("export async function fetchTestToken");
  });
});

describe("emitter", () => {
  it("should generate concept files with correct filenames", () => {
    const files = generateConceptFiles(mockConcept);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("testToken.ts");
    expect(files[0].content).toContain("export interface TestToken");
  });

  it("should generate an index file with re-exports", () => {
    const index = generateIndexFile([mockConcept]);
    expect(index).toContain('export * from "./testToken.js"');
    expect(index).toContain("AUTO-GENERATED");
  });
});
