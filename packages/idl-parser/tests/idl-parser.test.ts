import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isIdlV0,
  isIdlV1,
  convertCamelToSnake,
  calculateDiscriminator,
  migrateIdlV0ToV1,
  mapIdlTypeToOntology,
  inferRelationships,
  generateStateTransitions,
  generateConceptsFromIdl,
} from "../src/index.js";
import type { IdlV0, IdlV1 } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf-8"));
}

describe("idl-parser", () => {
  describe("type guards", () => {
    it("should detect v0 IDL", () => {
      const v0 = loadFixture("token-v0.json");
      expect(isIdlV0(v0)).toBe(true);
      expect(isIdlV1(v0)).toBe(false);
    });

    it("should detect v1 IDL", () => {
      const v1 = loadFixture("token-v1.json");
      expect(isIdlV1(v1)).toBe(true);
      expect(isIdlV0(v1)).toBe(false);
    });
  });

  describe("codemod", () => {
    it("should convert camelCase to snake_case", () => {
      expect(convertCamelToSnake("initializeMint")).toBe("initialize_mint");
      expect(convertCamelToSnake("tokenAccount")).toBe("token_account");
      expect(convertCamelToSnake("already_snake")).toBe("already_snake");
      expect(convertCamelToSnake("simple")).toBe("simple");
    });

    it("should calculate 8-byte discriminators", () => {
      const disc = calculateDiscriminator("account");
      expect(disc).toHaveLength(8);
      expect(disc.every((b) => b >= 0 && b <= 255)).toBe(true);

      // Same input → same output (deterministic)
      expect(calculateDiscriminator("account")).toEqual(disc);
    });

    it("should migrate v0 to v1", () => {
      const v0 = loadFixture("token-v0.json") as IdlV0;
      const v1 = migrateIdlV0ToV1(v0);

      expect(v1.address).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      expect(v1.metadata.name).toBe("token_program");
      expect(v1.metadata.version).toBe("0.1.0");
      expect(v1.metadata.spec).toBe("0.1.0");

      // Instructions should have discriminators and snake_case names
      expect(v1.instructions[0].name).toBe("initialize_mint");
      expect(v1.instructions[0].discriminator).toHaveLength(8);

      // isMut → writable, isSigner → signer
      const initMint = v1.instructions[0];
      expect(initMint.accounts[0].writable).toBe(true);
      expect(initMint.accounts[0].signer).toBe(false);

      // Accounts should have discriminators
      expect(v1.accounts[0].name).toBe("mint");
      expect(v1.accounts[0].discriminator).toHaveLength(8);

      // Fields should be snake_case
      const tokenAccount = v1.accounts[1];
      expect(tokenAccount.type.fields[0].name).toBe("mint");
    });
  });

  describe("concept-generator", () => {
    it("should map IDL types to ontology types", () => {
      expect(mapIdlTypeToOntology("u64")).toBe("u64");
      expect(mapIdlTypeToOntology("pubkey")).toBe("Address");
      expect(mapIdlTypeToOntology("bool")).toBe("bool");
      expect(mapIdlTypeToOntology("string")).toBe("string");
      expect(mapIdlTypeToOntology("bytes")).toBe("bytes");
      expect(mapIdlTypeToOntology({ option: "pubkey" })).toBe("Option<Address>");
      expect(mapIdlTypeToOntology({ vec: "u8" })).toBe("Vec<u8>");
    });

    it("should infer relationships from Pubkey fields", () => {
      const v1 = loadFixture("token-v1.json") as IdlV1;
      const accountNames = new Set(v1.accounts.map((a) => a.name));
      const tokenAccount = v1.accounts[1]; // token_account has mint field

      const rels = inferRelationships(tokenAccount, accountNames);
      expect(rels.length).toBeGreaterThan(0);
      expect(rels.some((r) => r.target === "Mint")).toBe(true);
    });

    it("should generate state transitions from instructions", () => {
      const v1 = loadFixture("token-v1.json") as IdlV1;
      const sm = generateStateTransitions(v1, "mint");

      expect(sm).toBeDefined();
      expect(sm!.states).toContain("Uninitialized");
      expect(sm!.states).toContain("Active");
      expect(sm!.transitions.length).toBeGreaterThan(0);
    });

    it("should generate concepts from IDL v1", () => {
      const v1 = loadFixture("token-v1.json") as IdlV1;
      const concepts = generateConceptsFromIdl(v1);

      expect(concepts.length).toBe(2); // mint + token_account

      const mintConcept = concepts.find((c) => c.canonicalName === "Mint");
      expect(mintConcept).toBeDefined();
      expect(mintConcept!.category).toBe("token");
      expect(mintConcept!.properties!.length).toBeGreaterThan(0);
      expect(mintConcept!.properties!.some((p) => p.type === "u64")).toBe(true);

      const tokenAccountConcept = concepts.find((c) => c.canonicalName === "TokenAccount");
      expect(tokenAccountConcept).toBeDefined();
      expect(tokenAccountConcept!.relationships).toBeDefined();
      expect(tokenAccountConcept!.relationships!.some((r) => r.target === "Mint")).toBe(true);
    });

    it("should generate concepts from v0 IDL via codemod", () => {
      const v0 = loadFixture("token-v0.json") as IdlV0;
      const v1 = migrateIdlV0ToV1(v0);
      const concepts = generateConceptsFromIdl(v1);

      expect(concepts.length).toBe(2);
      expect(concepts.some((c) => c.canonicalName === "Mint")).toBe(true);
      expect(concepts.some((c) => c.canonicalName === "TokenAccount")).toBe(true);
    });
  });
});
