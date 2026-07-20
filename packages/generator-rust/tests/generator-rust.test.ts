import { describe, it, expect } from "vitest";
import type { Concept } from "@solana-ontology/core";
import {
  mapSolanaTypeToRust,
  toSnakeCase,
  generateRustStruct,
} from "../src/type-gen.js";
import { generateRustPdaHelper } from "../src/pda-gen.js";
import { generateConceptRustFile, generateRustModFile } from "../src/emitter.js";

const mockConcept: Concept = {
  canonicalName: "TestToken",
  purpose: "A test token concept",
  category: "token",
  version: "1.0.0",
  properties: [
    { name: "mint", type: "Address", required: true, description: "Mint address" },
    { name: "supply", type: "u64", required: true },
    { name: "authority", type: "Address", required: false },
  ],
  relationships: [
    { type: "derivedFrom", target: "PDA", cardinality: "0:1" },
  ],
};

describe("type-gen", () => {
  it("should map Solana types to Rust types", () => {
    expect(mapSolanaTypeToRust("Address")).toBe("Pubkey");
    expect(mapSolanaTypeToRust("u64")).toBe("u64");
    expect(mapSolanaTypeToRust("bool")).toBe("bool");
    expect(mapSolanaTypeToRust("bytes")).toBe("Vec<u8>");
    expect(mapSolanaTypeToRust("Address[]")).toBe("Vec<Pubkey>");
  });

  it("should convert PascalCase to snake_case", () => {
    expect(toSnakeCase("TokenMint")).toBe("token_mint");
    expect(toSnakeCase("LiquidityPool")).toBe("liquidity_pool");
    expect(toSnakeCase("NFT")).toBe("n_f_t");
  });

  it("should generate a Rust struct", () => {
    const code = generateRustStruct(mockConcept);
    expect(code).toContain("pub struct TestToken");
    expect(code).toContain("pub mint: Pubkey,");
    expect(code).toContain("pub supply: u64,");
    expect(code).toContain("pub authority: Option<Pubkey>,");
  });
});

describe("pda-gen", () => {
  it("should generate PDA helper for PDA concepts", () => {
    const code = generateRustPdaHelper(mockConcept);
    expect(code).not.toBeNull();
    expect(code).toContain("derive_test_token_address");
  });
});

describe("emitter", () => {
  it("should generate a .rs file with correct name", () => {
    const file = generateConceptRustFile(mockConcept);
    expect(file.path).toBe("test_token.rs");
    expect(file.content).toContain("pub struct TestToken");
  });

  it("should generate a mod.rs barrel", () => {
    const mod = generateRustModFile([mockConcept]);
    expect(mod).toContain("pub mod test_token;");
  });
});
