import { describe, it, expect } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import {
  generatePoCTestScaffold,
  generateAllPoCTestScaffolds,
  generateRealWorldPoCTest,
  generateAllRealWorldPoCTests,
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

  it("should have 13 security concepts to generate scaffolds for", () => {
    expect(securityConcepts.length).toBe(13);
  });

  it("should generate a PoC test scaffold for each security concept", () => {
    const scaffolds = generateAllPoCTestScaffolds(concepts);
    expect(scaffolds.length).toBe(13);

    for (const s of scaffolds) {
      expect(s.filename).toMatch(/\.test\.ts$/);
      expect(s.content).toContain("import");
      expect(s.content).toContain("describe(");
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

describe("security-gen: real-world PoC tests from program-examples", () => {
  const concepts = loadConcepts(CONCEPTS_DIR, ONTOLOGY_ROOT);

  it("should generate PoC tests for all 21 real-world programs", () => {
    const scaffolds = generateAllRealWorldPoCTests(concepts);
    expect(scaffolds.length).toBe(21);

    const filenames = scaffolds.map((s) => s.filename);
    expect(filenames).toContain("escrow.test.ts");
    expect(filenames).toContain("automated_market_maker.test.ts");
    expect(filenames).toContain("fundraiser.test.ts");
    expect(filenames).toContain("transfer_hook.test.ts");
    expect(filenames).toContain("counter.test.ts");
    expect(filenames).toContain("validator_governance.test.ts");
    expect(filenames).toContain("ncn_ballot.test.ts");
    expect(filenames).toContain("merkle_proof_verifier.test.ts");
    expect(filenames).toContain("payment_challenge.test.ts");
    expect(filenames).toContain("multi_party_payment.test.ts");
    expect(filenames).toContain("payment_settlement.test.ts");
    expect(filenames).toContain("signer_authorization.test.ts");
    expect(filenames).toContain("account_data_matching.test.ts");
    expect(filenames).toContain("type_cosplay.test.ts");
    expect(filenames).toContain("pda_sharing.test.ts");
    expect(filenames).toContain("bump_seed_canonicalization.test.ts");
    expect(filenames).toContain("closing_accounts.test.ts");
    expect(filenames).toContain("coral_multisig.test.ts");
    expect(filenames).toContain("multisig_transaction.test.ts");
    expect(filenames).toContain("tic_tac_toe_game.test.ts");
    expect(filenames).toContain("tic_tac_toe_play.test.ts");
  });

  it("should generate Escrow exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "Escrow")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("Escrow");
    expect(scaffold).toContain("non-maker");
    expect(scaffold).toContain("wrong taker mint");
    expect(scaffold).toContain("double Take");
    expect(scaffold).toContain("PoCEnvironment");
  });

  it("should generate AMM exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "AutomatedMarketMaker")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("AMM");
    expect(scaffold).toContain("constant product");
    expect(scaffold).toContain("token confusion");
    expect(scaffold).toContain("overflow");
  });

  it("should generate Fundraiser exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "Fundraiser")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("Fundraiser");
    expect(scaffold).toContain("non-creator");
    expect(scaffold).toContain("deadline");
    expect(scaffold).toContain("overflow");
  });

  it("should generate TransferHook exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "TransferHook")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("TransferHook");
    expect(scaffold).toContain("blocklisted");
    expect(scaffold).toContain("non-authority");
  });

  it("should generate Counter exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "Counter")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("Counter");
    expect(scaffold).toContain("non-authority");
    expect(scaffold).toContain("overflow");
    expect(scaffold).toContain("fake PDA");
  });

  it("should include real-world source reference in all real-world tests", () => {
    const scaffolds = generateAllRealWorldPoCTests(concepts);
    for (const s of scaffolds) {
      // Each test should reference a solana-foundation repo
      expect(
        s.content.includes("solana-foundation/program-examples") ||
        s.content.includes("solana-foundation/solana-governance") ||
        s.content.includes("solana-foundation/pay-kit") ||
        s.content.includes("coral-xyz/sealevel-attacks") ||
        s.content.includes("coral-xyz/multisig") ||
        s.content.includes("coral-xyz/anchor-book")
      ).toBe(true);
    }
  });

  it("should use concept links.docs for source attribution", () => {
    const escrowConcept = concepts.find((c) => c.canonicalName === "Escrow")!;
    const scaffold = generateRealWorldPoCTest(escrowConcept);
    expect(scaffold).toContain("https://github.com/solana-foundation/program-examples/tree/main/tokens/escrow");

    const govConcept = concepts.find((c) => c.canonicalName === "ValidatorGovernance")!;
    const govScaffold = generateRealWorldPoCTest(govConcept);
    expect(govScaffold).toContain("https://github.com/solana-foundation/solana-governance");

    const payConcept = concepts.find((c) => c.canonicalName === "PaymentChallenge")!;
    const payScaffold = generateRealWorldPoCTest(payConcept);
    expect(payScaffold).toContain("https://github.com/solana-foundation/pay-kit");

    const seaConcept = concepts.find((c) => c.canonicalName === "SignerAuthorization")!;
    const seaScaffold = generateRealWorldPoCTest(seaConcept);
    expect(seaScaffold).toContain("coral-xyz/sealevel-attacks");

    const msigConcept = concepts.find((c) => c.canonicalName === "CoralMultisig")!;
    const msigScaffold = generateRealWorldPoCTest(msigConcept);
    expect(msigScaffold).toContain("coral-xyz/multisig");

    const tttConcept = concepts.find((c) => c.canonicalName === "TicTacToeGame")!;
    const tttScaffold = generateRealWorldPoCTest(tttConcept);
    expect(tttScaffold).toContain("coral-xyz/anchor-book");
  });

  it("should generate ValidatorGovernance exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "ValidatorGovernance")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("ValidatorGovernance");
    expect(scaffold).toContain("non-proposer");
    expect(scaffold).toContain("merkle proof");
    expect(scaffold).toContain("overflow");
  });

  it("should generate NcnBallot exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "NcnBallot")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("NcnBallot");
    expect(scaffold).toContain("non-operator");
    expect(scaffold).toContain("deadline");
  });

  it("should generate MerkleProofVerifier exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "MerkleProofVerifier")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("MerkleProofVerifier");
    expect(scaffold).toContain("invalid merkle proof");
    expect(scaffold).toContain("non-authority");
  });

  it("should generate PaymentChallenge exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "PaymentChallenge")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("PaymentChallenge");
    expect(scaffold).toContain("nonce reuse");
    expect(scaffold).toContain("wrong amount");
    expect(scaffold).toContain("expired");
  });

  it("should generate MultiPartyPayment exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "MultiPartyPayment")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("MultiPartyPayment");
    expect(scaffold).toContain("splits");
    expect(scaffold).toContain("non-fee-payer");
  });

  it("should generate PaymentSettlement exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "PaymentSettlement")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("PaymentSettlement");
    expect(scaffold).toContain("fake transaction signature");
    expect(scaffold).toContain("double receipt");
  });

  it("should generate SignerAuthorization exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "SignerAuthorization")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("SignerAuthorization");
    expect(scaffold).toContain("not a signer");
    expect(scaffold).toContain("impersonated authority");
  });

  it("should generate AccountDataMatching exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "AccountDataMatching")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("AccountDataMatching");
    expect(scaffold).toContain("fake token account");
    expect(scaffold).toContain("arbitrary account");
  });

  it("should generate TypeCosplay exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "TypeCosplay")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("TypeCosplay");
    expect(scaffold).toContain("wrong type");
    expect(scaffold).toContain("shared discriminator");
  });

  it("should generate PdaSharing exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "PdaSharing")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("PdaSharing");
    expect(scaffold).toContain("PDA collision");
    expect(scaffold).toContain("drain vault");
  });

  it("should generate BumpSeedCanonicalization exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "BumpSeedCanonicalization")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("BumpSeedCanonicalization");
    expect(scaffold).toContain("non-canonical bump");
    expect(scaffold).toContain("alternative PDA");
  });

  it("should generate ClosingAccounts exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "ClosingAccounts")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("ClosingAccounts");
    expect(scaffold).toContain("clear account data");
    expect(scaffold).toContain("reinitialization");
  });

  it("should generate CoralMultisig exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "CoralMultisig")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("CoralMultisig");
    expect(scaffold).toContain("threshold owners signed");
    expect(scaffold).toContain("stale transaction");
    expect(scaffold).toContain("double execution");
  });

  it("should generate MultisigTransaction exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "MultisigTransaction")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("MultisigTransaction");
    expect(scaffold).toContain("non-owner");
    expect(scaffold).toContain("already executed");
  });

  it("should generate TicTacToeGame exploit tests with 3 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "TicTacToeGame")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("TicTacToeGame");
    expect(scaffold).toContain("player's turn");
    expect(scaffold).toContain("already-occupied");
    expect(scaffold).toContain("game is already over");
  });

  it("should generate TicTacToePlay exploit tests with 2 scenarios", () => {
    const concept = concepts.find((c) => c.canonicalName === "TicTacToePlay")!;
    const scaffold = generateRealWorldPoCTest(concept);

    expect(scaffold).toContain("TicTacToePlay");
    expect(scaffold).toContain("out of bounds");
    expect(scaffold).toContain("non-participant");
  });
});
