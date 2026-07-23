import { describe, it, expect } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import {
  generatePoCTestScaffold,
  generateAllPoCTestScaffolds,
  generateGuardCode,
  generateAdversarialTest,
} from "../src/index.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ONTOLOGY_ROOT = join(PROJECT_ROOT, "ontology");
const CONCEPTS_DIR = join(ONTOLOGY_ROOT, "concepts");

describe("security-gen: PoC test scaffold generation", () => {
  const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);
  const securityConcepts = concepts.filter((c) => c.category === "security");

  it("should have 7 security concepts to generate scaffolds for", () => {
    expect(securityConcepts.length).toBe(7);
  });

  it("should generate a PoC test scaffold for each security concept", () => {
    const scaffolds = generateAllPoCTestScaffolds(concepts);
    expect(scaffolds.length).toBe(7);

    for (const s of scaffolds) {
      expect(s.filename).toMatch(/\.test\.ts$/);
      expect(s.content).toContain("import");
      expect(s.content).toContain("describe(");
      expect(s.content).toContain("PoCEnvironment");
    }
  });

  it("should generate MissingSignerCheck scaffold with unsigned authority exploit", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "MissingSignerCheck")!;
    const scaffold = generatePoCTestScaffold(concept);

    expect(scaffold).toContain("MissingSignerCheck");
    expect(scaffold).toContain("isSigner: false");
    expect(scaffold).toContain("without signer");
    expect(scaffold).toContain("beforeAll");
    expect(scaffold).toContain("requestAirdrop");
  });

  it("should generate AccountSubstitution scaffold with fake account exploit", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "AccountSubstitution")!;
    const scaffold = generatePoCTestScaffold(concept);

    expect(scaffold).toContain("AccountSubstitution");
    expect(scaffold).toContain("fake config account");
    expect(scaffold).toContain("SystemProgram.programId");
  });

  it("should generate MissingOwnerCheck scaffold with wrong owner exploit", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "MissingOwnerCheck")!;
    const scaffold = generatePoCTestScaffold(concept);

    expect(scaffold).toContain("MissingOwnerCheck");
    expect(scaffold).toContain("owner");
    expect(scaffold).toContain("getAccount");
  });

  it("should generate SplTokenConfusion scaffold with mint swap exploit", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "SplTokenConfusion")!;
    const scaffold = generatePoCTestScaffold(concept);

    expect(scaffold).toContain("SplTokenConfusion");
    expect(scaffold).toContain("createTokenMint");
    expect(scaffold).toContain("mintAKeypair");
    expect(scaffold).toContain("mintBKeypair");
  });

  it("should generate PdaSeedMismatch scaffold with wrong seeds exploit", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "PdaSeedMismatch")!;
    const scaffold = generatePoCTestScaffold(concept);

    expect(scaffold).toContain("PdaSeedMismatch");
    expect(scaffold).toContain("findProgramAddressSync");
    expect(scaffold).toContain("wrong_seed");
    expect(scaffold).toContain("collision");
  });

  it("should generate IntegerOverflow scaffold with u64::MAX exploit", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "IntegerOverflow")!;
    const scaffold = generatePoCTestScaffold(concept);

    expect(scaffold).toContain("IntegerOverflow");
    expect(scaffold).toContain("18446744073709551615");
    expect(scaffold).toContain("setBigUint64");
    expect(scaffold).toContain("overflow");
  });

  it("should generate ArbitraryCpiInvocation scaffold with fake program exploit", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "ArbitraryCpiInvocation")!;
    const scaffold = generatePoCTestScaffold(concept);

    expect(scaffold).toContain("ArbitraryCpiInvocation");
    expect(scaffold).toContain("fakeTokenProgram");
    expect(scaffold).toContain("CPI target");
  });

  it("should generate guard code for concepts with requiredAuth", () => {
    // MissingSignerCheck is a pattern concept without requiredAuth — guard should be empty
    const concept = securityConcepts.find((c) => c.canonicalName === "MissingSignerCheck")!;
    const guard = generateGuardCode(concept);
    expect(guard).toBe(""); // no security fields set on pattern concepts
  });

  it("should generate guard code when requiredAuth is set", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "MissingSignerCheck")!;
    const guard = generateGuardCode({ ...concept, requiredAuth: "authority" });
    expect(guard).toContain("Auto-generated security guards");
    expect(guard).toContain("is_signer");
  });

  it("should generate adversarial test stubs", () => {
    const concept = securityConcepts.find((c) => c.canonicalName === "MissingSignerCheck")!;
    const test = generateAdversarialTest(concept);
    expect(test).toContain("Adversarial tests");
  });
});
