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
import { validateAll } from "@solana-ontology/core";

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

    it("should match Anchor's canonical discriminator values", () => {
      // Instruction: sha256("global:initialize")[0..8] — the well-known Anchor sighash
      expect(calculateDiscriminator("initialize")).toEqual([175, 175, 109, 31, 13, 152, 155, 237]);
      // Account: sha256("account:<StructName as written>")[0..8]
      expect(calculateDiscriminator("TokenAccount", "account")).toEqual([
        220, 131, 236, 16, 145, 206, 207, 54,
      ]);
      // Published Whirlpool IDL account discriminator
      expect(calculateDiscriminator("Whirlpool", "account")).toEqual([
        63, 149, 209, 12, 225, 128, 99, 9,
      ]);
    });

    it("should use the account namespace and original casing for migrated account discriminators", () => {
      const v0 = loadFixture("token-v0.json") as IdlV0;
      const v1 = migrateIdlV0ToV1(v0);
      const original = v0.accounts![0].name;
      expect(v1.accounts[0].discriminator).toEqual(calculateDiscriminator(original, "account"));
    });

    it("should translate legacy publicKey type to pubkey", () => {
      const v0 = loadFixture("token-v0.json") as IdlV0;
      const modified: IdlV0 = {
        ...v0,
        accounts: [
          {
            name: "Sample",
            type: {
              kind: "struct",
              fields: [
                { name: "owner", type: "publicKey" },
                { name: "delegate", type: { option: "publicKey" } },
              ],
            },
          },
        ],
      };
      const v1 = migrateIdlV0ToV1(modified);
      const fields = v1.accounts[0].type.fields;
      expect(fields[0].type).toBe("pubkey");
      expect((fields[1].type as { option?: unknown }).option).toBe("pubkey");
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

    it("carries defined struct types (transitively) into idlInstruction.definedTypes", () => {
      const v1: IdlV1 = {
        address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        metadata: { name: "vault_program", version: "1.0.0", spec: "0.1.0" },
        instructions: [
          {
            name: "configure",
            discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
            accounts: [{ name: "vault", writable: true, signer: false }],
            args: [{ name: "config", type: { defined: "VaultConfig" } }],
          },
        ],
        accounts: [
          {
            name: "vault",
            discriminator: [9, 9, 9, 9, 9, 9, 9, 9],
            type: { kind: "struct", fields: [{ name: "fee", type: "u16" }] },
          },
        ],
        types: [
          {
            name: "VaultConfig",
            type: {
              kind: "struct",
              fields: [
                { name: "fee", type: "u16" },
                { name: "limits", type: { defined: "Limits" } }, // nested struct
              ],
            },
          },
          {
            name: "Limits",
            type: { kind: "struct", fields: [{ name: "max", type: "u64" }] },
          },
          {
            name: "UnrelatedEnum",
            type: { kind: "enum", fields: [] },
          },
        ],
      };
      const concepts = generateConceptsFromIdl(v1);
      const definedTypes = concepts[0].idlInstruction?.definedTypes;
      expect(definedTypes).toBeDefined();
      expect(definedTypes!.map((t) => t.name).sort()).toEqual(["Limits", "VaultConfig"]);
      const config = definedTypes!.find((t) => t.name === "VaultConfig")!;
      expect(config.fields).toEqual([
        { name: "fee", type: "u16" },
        { name: "limits", type: "defined<Limits>" },
      ]);
      // Generated concepts (including definedTypes) still pass schema validation
      expect(validateAll(concepts).valid).toBe(true);
    });

    it("omits programId when the IDL address is empty/invalid (v0 without metadata.address)", () => {
      // A v0 IDL with no metadata.address migrates to v1 with address "".
      const v0: IdlV0 = {
        version: "0.1.0",
        name: "no_addr_program",
        instructions: [
          { name: "Init", accounts: [{ name: "state", isMut: true, isSigner: false }], args: [] },
        ],
        accounts: [
          {
            name: "StateAccount",
            type: { kind: "struct", fields: [{ name: "value", type: "u64" }] },
          },
        ],
      };
      const v1 = migrateIdlV0ToV1(v0);
      expect(v1.address).toBe("");

      const concepts = generateConceptsFromIdl(v1);
      expect(concepts.length).toBeGreaterThan(0);
      // No concept should carry an (invalid) empty programId...
      for (const c of concepts) {
        expect(c.programId).toBeUndefined();
      }
      // ...and every generated concept must still pass schema validation.
      expect(validateAll(concepts).valid).toBe(true);
    });
  });
});
