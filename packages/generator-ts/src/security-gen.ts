import type { Concept, StateTransition } from "@solana-ontology/core";

/**
 * Generate guard code for a concept based on its security fields.
 * These guards should be inserted at the top of each instruction handler.
 */
export function generateGuardCode(concept: Concept): string {
  const guards: string[] = [];

  // Guard: requiredAuth — verify signer is the expected authority
  if (concept.requiredAuth) {
    guards.push(
      `  // Security guard: verify ${concept.requiredAuth} is signer`,
      `  if (!ctx.accounts.${concept.requiredAuth}.is_signer) {`,
      `    return Err(ErrorCode::Unauthorized);`,
      `  }`,
    );
  }

  // Guard: requireOwnerCheck — verify account owner matches program ID
  if (concept.requireOwnerCheck && concept.programId) {
    guards.push(
      `  // Security guard: verify account owner is the expected program`,
      `  if (ctx.accounts.account.owner != ctx.program_id) {`,
      `    return Err(ErrorCode::AccountNotOwnedByProgram);`,
      `  }`,
    );
  }

  // Guard: per-transition auth checks
  if (concept.stateMachine?.transitions) {
    for (const t of concept.stateMachine.transitions) {
      const tGuards = generateTransitionGuard(t);
      if (tGuards) guards.push(tGuards);
    }
  }

  if (guards.length === 0) return "";

  return [
    `// ── Auto-generated security guards for ${concept.canonicalName} ──`,
    ``,
    ...guards,
  ].join("\n");
}

/**
 * Generate guard for a single state transition.
 */
function generateTransitionGuard(t: StateTransition): string | null {
  const lines: string[] = [];

  if (t.requiresAuth) {
    lines.push(
      `  // Transition guard (${t.from}→${t.to}): verify ${t.requiresAuth} is signer`,
      `  if (!ctx.accounts.${t.requiresAuth}.is_signer) {`,
      `    return Err(ErrorCode::Unauthorized);`,
      `  }`,
    );
  }

  if (t.requires) {
    lines.push(
      `  // Transition guard (${t.from}→${t.to}): precondition ${t.requires}`,
      `  // TODO: implement check: ${t.requires}`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Generate an adversarial test for a concept's security properties.
 * Tests that unauthorized callers are rejected.
 */
export function generateAdversarialTest(concept: Concept): string {
  const tests: string[] = [];

  tests.push(
    `// ── Adversarial tests for ${concept.canonicalName} ──`,
    `// Auto-generated from security validation rules`,
    ``,
  );

  if (concept.requiredAuth) {
    tests.push(
      `it("should reject unsigned ${concept.requiredAuth}", async () => {`,
      `  const action = buildAction("${concept.canonicalName}", {`,
      `    ...validInputs,`,
      `    skipSigner: true,`,
      `  });`,
      `  await expect(lifecycle.execute(action)).rejects.toThrow("Unauthorized");`,
      `});`,
      ``,
    );
  }

  if (concept.requireOwnerCheck && concept.programId) {
    tests.push(
      `it("should reject account with wrong owner", async () => {`,
      `  const action = buildAction("${concept.canonicalName}", {`,
      `    ...validInputs,`,
      `    account: fakeAccountWithWrongOwner(),`,
      `  });`,
      `  await expect(lifecycle.execute(action)).rejects.toThrow("AccountNotOwnedByProgram");`,
      `});`,
      ``,
    );
  }

  if (concept.stateMachine?.transitions) {
    for (const t of concept.stateMachine.transitions) {
      if (!t.requiresAuth && !t.requires) continue;
      tests.push(
        `it("should reject transition ${t.from}→${t.to} without precondition", async () => {`,
        `  const action = buildAction("${concept.canonicalName}", {`,
        `    ...validInputs,`,
        `    currentState: "${t.from}",`,
        `    skipPrecondition: true,`,
        `  });`,
        `  await expect(lifecycle.execute(action)).rejects.toThrow();`,
        `});`,
        ``,
      );
    }
  }

  return tests.join("\n");
}

/**
 * Generate all security artifacts for a concept.
 */
export function generateSecurityArtifacts(concept: Concept): {
  guards: string;
  tests: string;
} {
  return {
    guards: generateGuardCode(concept),
    tests: generateAdversarialTest(concept),
  };
}

// ── PoC Test Scaffold Generator ─────────────────────────────────────────────

/**
 * Vulnerability pattern → exploit test mapping.
 * Each pattern generates a specific exploit scenario using PoCEnvironment.
 */
const EXPLOIT_PATTERNS: Record<
  string,
  {
    describe: string;
    exploits: (concept: Concept) => string[];
  }
> = {
  MissingSignerCheck: {
    describe: "MissingSignerCheck — call transition without signing",
    exploits: (c) => [exploitMissingSigner(c), exploitWrongSigner(c)],
  },
  AccountSubstitution: {
    describe: "AccountSubstitution — substitute a fake account",
    exploits: (c) => [exploitFakeAccount(c), exploitCrossProgramAccount(c)],
  },
  MissingOwnerCheck: {
    describe: "MissingOwnerCheck — pass account with wrong owner",
    exploits: (c) => [exploitWrongOwner(c), exploitSystemOwnedAccount(c)],
  },
  SplTokenConfusion: {
    describe: "SplTokenConfusion — swap mint/token accounts",
    exploits: (c) => [exploitTokenMintSwap(c), exploitWrongTokenAccount(c)],
  },
  PdaSeedMismatch: {
    describe: "PdaSeedMismatch — derive PDA with wrong seeds",
    exploits: (c) => [exploitWrongSeeds(c), exploitCollidingSeeds(c)],
  },
  IntegerOverflow: {
    describe: "IntegerOverflow — pass max values to trigger wrap-around",
    exploits: (c) => [exploitOverflowAmount(c), exploitUnderflowBalance(c)],
  },
  ArbitraryCpiInvocation: {
    describe: "ArbitraryCpiInvocation — substitute fake program for CPI",
    exploits: (c) => [exploitFakeCpiTarget(c)],
  },
};

/**
 * Generate a complete PoC test file for a security concept.
 * Uses PoCEnvironment to set up the test harness and attempt the exploit.
 */
export function generatePoCTestScaffold(concept: Concept): string {
  const pattern = EXPLOIT_PATTERNS[concept.canonicalName];
  if (!pattern) return generateGenericPoCTest(concept);

  const testName = concept.canonicalName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .slice(1);
  const exploits = pattern.exploits(concept);

  return `/**
 * PoC Exploit Test: ${concept.canonicalName}
 *
 * Vulnerability: ${concept.purpose}
 * Category: ${concept.category}
 *
 * Auto-generated from security ontology concepts.
 * Requires: local validator running at http://localhost:8899
 *
 * Run: npx vitest run tests/poc/${testName}.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PoCEnvironment, type IPoCEnvironment, type PoCTransactionResult } from "@solana-ontology/sdk";

describe("${pattern.describe}", () => {
  let env: IPoCEnvironment;
  let payerKeypair: unknown;

  beforeAll(async () => {
    // ── Setup: create environment and fund payer ──
    const web3 = await import("@solana/web3.js");
    payerKeypair = web3.Keypair.generate();

    env = new PoCEnvironment({
      rpcUrl: "http://localhost:8899",
      payer: payerKeypair,
      commitment: "confirmed",
    });

    // Fund the payer with SOL from an airdrop
    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    const sig = await conn.requestAirdrop(
      new web3.PublicKey(env.payer()),
      10 * web3.LAMPORTS_PER_SOL,
    );
    await conn.confirmTransaction(sig);
  });

${exploits.join("\n")}
});
`;
}

/**
 * Generate a generic PoC test for concepts without a specific pattern.
 */
function generateGenericPoCTest(concept: Concept): string {
  return `/**
 * PoC Exploit Test: ${concept.canonicalName}
 * Auto-generated — no specific exploit pattern mapped.
 */
import { describe, it, expect } from "vitest";

describe("${concept.canonicalName} — generic PoC", () => {
  it("should be tested with concept-specific exploit scenarios", () => {
    // TODO: Define exploit scenarios for ${concept.canonicalName}
    // Reference: ${concept.purpose}
  });
});
`;
}

// ── Exploit function imports (split into per-concept-group modules) ────────

import {
  exploitMissingSigner,
  exploitWrongSigner,
  exploitFakeAccount,
  exploitCrossProgramAccount,
  exploitWrongOwner,
  exploitSystemOwnedAccount,
  exploitTokenMintSwap,
  exploitWrongTokenAccount,
  exploitWrongSeeds,
  exploitCollidingSeeds,
  exploitOverflowAmount,
  exploitUnderflowBalance,
  exploitFakeCpiTarget,
} from "./exploits/sealevel.js";
import {
  exploitEscrowNonMakerRefund,
  exploitEscrowWrongTakerMint,
  exploitEscrowDoubleTake,
  exploitAmmConstantProductViolation,
  exploitAmmTokenConfusion,
  exploitAmmOverflowReserve,
  exploitFundraiserNonCreatorClose,
  exploitFundraiserPastDeadline,
  exploitFundraiserOverflowContribution,
  exploitTransferHookBlockListBypass,
  exploitTransferHookNonAuthorityPause,
  exploitCounterNonAuthorityIncrement,
  exploitCounterOverflow,
  exploitCounterFakePda,
  exploitGovernanceNonProposerFinalize,
  exploitGovernanceFakeMerkleProof,
  exploitGovernanceVoteOverflow,
  exploitNcnNonOperatorClose,
  exploitNcnBallotAfterDeadline,
  exploitMerkleFakeProof,
  exploitMerkleNonAuthorityFreeze,
  exploitPaymentReplayAttack,
  exploitPaymentWrongAmount,
  exploitPaymentExpiredChallenge,
  exploitMppSplitMismatch,
  exploitMppNonFeePayerSettle,
  exploitSettlementFakeTxSignature,
  exploitSettlementDoubleReceipt,
} from "./exploits/program-examples.js";
import {
  exploitSealevelMissingSigner,
  exploitSealevelImpersonateAuthority,
  exploitSealevelFakeTokenAccount,
  exploitSealevelArbitraryAccountRead,
  exploitSealevelTypeConfusion,
  exploitSealevelSharedDiscriminator,
  exploitSealevelPdaCollision,
  exploitSealevelDrainVault,
  exploitSealevelNonCanonicalBump,
  exploitSealevelAlternativePda,
  exploitSealevelCloseWithoutClear,
  exploitSealevelReinitAfterClose,
} from "./exploits/sealevel-attacks.js";
import {
  exploitMultisigBelowThreshold,
  exploitMultisigStaleOwnerSet,
  exploitMultisigDoubleExecute,
  exploitMultisigTxNonOwnerApprove,
  exploitMultisigTxAlreadyExecuted,
} from "./exploits/coral-multisig.js";
import {
  exploitTicTacToeOutOfTurn,
  exploitTicTacToeTileAlreadySet,
  exploitTicTacToeAfterGameOver,
  exploitTicTacToeTileOutOfBounds,
  exploitTicTacToeWrongPlayer,
} from "./exploits/anchor-book.js";
import {
  exploitLightRegistryUnauthorizedConfigUpdate,
  exploitLightRegistryDoubleForesterRegistration,
  exploitLightRegistryInsufficientFunds,
  exploitCompressionInvalidMerkleProof,
  exploitCompressionWriteToRolledOverTree,
  exploitCompressionExceedBatchLimit,
  exploitCompressedTokenSumCheckBypass,
  exploitCompressedTokenFrozenAccountTransfer,
  exploitLightInvokeSignerCheckBypass,
  exploitLightInvokeCpiContextHijack,
} from "./exploits/light-protocol.js";
/**
 * Generate PoC test scaffolds for all security concepts in the ontology.
 * Returns a map of filename → test file content.
 */
export function generateAllPoCTestScaffolds(
  concepts: Concept[],
): { filename: string; content: string }[] {
  const securityConcepts = concepts.filter((c) => c.category === "security");
  const results: { filename: string; content: string }[] = [];

  for (const concept of securityConcepts) {
    const testName = concept.canonicalName
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .slice(1);
    results.push({
      filename: `${testName}.test.ts`,
      content: generatePoCTestScaffold(concept),
    });
  }

  return results;
}

// ── Real-World Exploit Generators (from Solana program-examples) ────────────

/**
 * Real-world exploit patterns mapped to specific program examples.
 * These generate targeted exploit tests based on the actual vulnerability
 * surface of each program from solana-foundation/program-examples.
 */
const REAL_WORLD_EXPLOITS: Record<
  string,
  {
    describe: string;
    exploits: (concept: Concept) => string[];
  }
> = {
  Escrow: {
    describe: "Escrow — atomic swap exploit scenarios",
    exploits: (c) => [
      exploitEscrowNonMakerRefund(c),
      exploitEscrowWrongTakerMint(c),
      exploitEscrowDoubleTake(c),
    ],
  },
  AutomatedMarketMaker: {
    describe: "AMM — token swap exploit scenarios",
    exploits: (c) => [
      exploitAmmConstantProductViolation(c),
      exploitAmmTokenConfusion(c),
      exploitAmmOverflowReserve(c),
    ],
  },
  Fundraiser: {
    describe: "Fundraiser — crowdfunding exploit scenarios",
    exploits: (c) => [
      exploitFundraiserNonCreatorClose(c),
      exploitFundraiserPastDeadline(c),
      exploitFundraiserOverflowContribution(c),
    ],
  },
  TransferHook: {
    describe: "TransferHook — transfer restriction bypass",
    exploits: (c) => [
      exploitTransferHookBlockListBypass(c),
      exploitTransferHookNonAuthorityPause(c),
    ],
  },
  Counter: {
    describe: "Counter — minimal state exploit scenarios",
    exploits: (c) => [
      exploitCounterNonAuthorityIncrement(c),
      exploitCounterOverflow(c),
      exploitCounterFakePda(c),
    ],
  },
  ValidatorGovernance: {
    describe: "ValidatorGovernance — protocol governance exploit scenarios",
    exploits: (c) => [
      exploitGovernanceNonProposerFinalize(c),
      exploitGovernanceFakeMerkleProof(c),
      exploitGovernanceVoteOverflow(c),
    ],
  },
  NcnBallot: {
    describe: "NcnBallot — NCN consensus ballot exploit scenarios",
    exploits: (c) => [exploitNcnNonOperatorClose(c), exploitNcnBallotAfterDeadline(c)],
  },
  MerkleProofVerifier: {
    describe: "MerkleProofVerifier — merkle proof bypass scenarios",
    exploits: (c) => [exploitMerkleFakeProof(c), exploitMerkleNonAuthorityFreeze(c)],
  },
  PaymentChallenge: {
    describe: "PaymentChallenge — x402 paywall exploit scenarios",
    exploits: (c) => [
      exploitPaymentReplayAttack(c),
      exploitPaymentWrongAmount(c),
      exploitPaymentExpiredChallenge(c),
    ],
  },
  MultiPartyPayment: {
    describe: "MultiPartyPayment — MPP split exploit scenarios",
    exploits: (c) => [exploitMppSplitMismatch(c), exploitMppNonFeePayerSettle(c)],
  },
  PaymentSettlement: {
    describe: "PaymentSettlement — settlement verification exploits",
    exploits: (c) => [exploitSettlementFakeTxSignature(c), exploitSettlementDoubleReceipt(c)],
  },
  SignerAuthorization: {
    describe: "SignerAuthorization — missing signer check exploits",
    exploits: (c) => [exploitSealevelMissingSigner(c), exploitSealevelImpersonateAuthority(c)],
  },
  AccountDataMatching: {
    describe: "AccountDataMatching — fake account type exploits",
    exploits: (c) => [exploitSealevelFakeTokenAccount(c), exploitSealevelArbitraryAccountRead(c)],
  },
  TypeCosplay: {
    describe: "TypeCosplay — struct reinterpretation exploits",
    exploits: (c) => [exploitSealevelTypeConfusion(c), exploitSealevelSharedDiscriminator(c)],
  },
  PdaSharing: {
    describe: "PdaSharing — PDA collision exploits",
    exploits: (c) => [exploitSealevelPdaCollision(c), exploitSealevelDrainVault(c)],
  },
  BumpSeedCanonicalization: {
    describe: "BumpSeedCanonicalization — non-canonical bump exploits",
    exploits: (c) => [exploitSealevelNonCanonicalBump(c), exploitSealevelAlternativePda(c)],
  },
  ClosingAccounts: {
    describe: "ClosingAccounts — close and reinit exploits",
    exploits: (c) => [exploitSealevelCloseWithoutClear(c), exploitSealevelReinitAfterClose(c)],
  },
  CoralMultisig: {
    describe: "CoralMultisig — threshold governance exploits",
    exploits: (c) => [
      exploitMultisigBelowThreshold(c),
      exploitMultisigStaleOwnerSet(c),
      exploitMultisigDoubleExecute(c),
    ],
  },
  MultisigTransaction: {
    describe: "MultisigTransaction — proposed tx execution exploits",
    exploits: (c) => [exploitMultisigTxNonOwnerApprove(c), exploitMultisigTxAlreadyExecuted(c)],
  },
  TicTacToeGame: {
    describe: "TicTacToeGame — turn-based game state exploits",
    exploits: (c) => [
      exploitTicTacToeOutOfTurn(c),
      exploitTicTacToeTileAlreadySet(c),
      exploitTicTacToeAfterGameOver(c),
    ],
  },
  TicTacToePlay: {
    describe: "TicTacToePlay — move validation exploits",
    exploits: (c) => [exploitTicTacToeTileOutOfBounds(c), exploitTicTacToeWrongPlayer(c)],
  },
  LightProtocolRegistry: {
    describe: "LightProtocolRegistry — ZK compression registry exploits",
    exploits: (c) => [
      exploitLightRegistryUnauthorizedConfigUpdate(c),
      exploitLightRegistryDoubleForesterRegistration(c),
      exploitLightRegistryInsufficientFunds(c),
    ],
  },
  AccountCompressionTree: {
    describe: "AccountCompressionTree — Merkle tree state exploits",
    exploits: (c) => [
      exploitCompressionInvalidMerkleProof(c),
      exploitCompressionWriteToRolledOverTree(c),
      exploitCompressionExceedBatchLimit(c),
    ],
  },
  CompressedToken: {
    describe: "CompressedToken — compressed token transfer exploits",
    exploits: (c) => [
      exploitCompressedTokenSumCheckBypass(c),
      exploitCompressedTokenFrozenAccountTransfer(c),
    ],
  },
  LightSystemInvoke: {
    describe: "LightSystemInvoke — compressed invoke CPI exploits",
    exploits: (c) => [
      exploitLightInvokeSignerCheckBypass(c),
      exploitLightInvokeCpiContextHijack(c),
    ],
  },
};

/**
 * Generate a PoC test file for a real-world program concept.
 */
export function generateRealWorldPoCTest(concept: Concept): string {
  const pattern = REAL_WORLD_EXPLOITS[concept.canonicalName];
  if (!pattern) return generateGenericPoCTest(concept);

  const testName = concept.canonicalName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .slice(1);
  const exploits = pattern.exploits(concept);

  const sourceUrl =
    concept.links && !Array.isArray(concept.links) && concept.links.docs?.[0]
      ? concept.links.docs[0]
      : "https://github.com/solana-foundation/program-examples";

  return `/**
 * Real-World PoC Exploit Test: ${concept.canonicalName}
 *
 * Based on: ${sourceUrl}
 * Concept: ${concept.purpose}
 *
 * Auto-generated from ontology with real-world exploit scenarios.
 * Requires: local validator running at http://localhost:8899
 *
 * Run: npx vitest run tests/poc/${testName}.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PoCEnvironment, type IPoCEnvironment } from "@solana-ontology/sdk";

describe("${pattern.describe}", () => {
  let env: IPoCEnvironment;
  let payerKeypair: unknown;

  beforeAll(async () => {
    const web3 = await import("@solana/web3.js");
    payerKeypair = web3.Keypair.generate();

    env = new PoCEnvironment({
      rpcUrl: "http://localhost:8899",
      payer: payerKeypair,
      commitment: "confirmed",
    });

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    const sig = await conn.requestAirdrop(
      new web3.PublicKey(env.payer()),
      10 * web3.LAMPORTS_PER_SOL,
    );
    await conn.confirmTransaction(sig);
  });

${exploits.join("\n")}
});
`;
}

/**
 * Generate PoC tests for all real-world program concepts.
 */
export function generateAllRealWorldPoCTests(
  concepts: Concept[],
): { filename: string; content: string }[] {
  const results: { filename: string; content: string }[] = [];

  for (const concept of concepts) {
    if (REAL_WORLD_EXPLOITS[concept.canonicalName]) {
      const testName = concept.canonicalName
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .slice(1);
      results.push({
        filename: `${testName}.test.ts`,
        content: generateRealWorldPoCTest(concept),
      });
    }
  }

  return results;
}
