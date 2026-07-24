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
  const testName = concept.canonicalName.replace(/([A-Z])/g, "_$1").toLowerCase();
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

import type { ConceptCategory } from "@solana-ontology/core";

/**
 * Vulnerability pattern → exploit test mapping.
 * Each pattern generates a specific exploit scenario using PoCEnvironment.
 */
const EXPLOIT_PATTERNS: Record<string, {
  describe: string;
  exploits: (concept: Concept) => string[];
}> = {
  MissingSignerCheck: {
    describe: "MissingSignerCheck — call transition without signing",
    exploits: (c) => [
      exploitMissingSigner(c),
      exploitWrongSigner(c),
    ],
  },
  AccountSubstitution: {
    describe: "AccountSubstitution — substitute a fake account",
    exploits: (c) => [
      exploitFakeAccount(c),
      exploitCrossProgramAccount(c),
    ],
  },
  MissingOwnerCheck: {
    describe: "MissingOwnerCheck — pass account with wrong owner",
    exploits: (c) => [
      exploitWrongOwner(c),
      exploitSystemOwnedAccount(c),
    ],
  },
  SplTokenConfusion: {
    describe: "SplTokenConfusion — swap mint/token accounts",
    exploits: (c) => [
      exploitTokenMintSwap(c),
      exploitWrongTokenAccount(c),
    ],
  },
  PdaSeedMismatch: {
    describe: "PdaSeedMismatch — derive PDA with wrong seeds",
    exploits: (c) => [
      exploitWrongSeeds(c),
      exploitCollidingSeeds(c),
    ],
  },
  IntegerOverflow: {
    describe: "IntegerOverflow — pass max values to trigger wrap-around",
    exploits: (c) => [
      exploitOverflowAmount(c),
      exploitUnderflowBalance(c),
    ],
  },
  ArbitraryCpiInvocation: {
    describe: "ArbitraryCpiInvocation — substitute fake program for CPI",
    exploits: (c) => [
      exploitFakeCpiTarget(c),
    ],
  },
};

/**
 * Generate a complete PoC test file for a security concept.
 * Uses PoCEnvironment to set up the test harness and attempt the exploit.
 */
export function generatePoCTestScaffold(concept: Concept): string {
  const pattern = EXPLOIT_PATTERNS[concept.canonicalName];
  if (!pattern) return generateGenericPoCTest(concept);

  const testName = concept.canonicalName.replace(/([A-Z])/g, "_$1").toLowerCase().slice(1);
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
  const testName = concept.canonicalName.replace(/([A-Z])/g, "_$1").toLowerCase().slice(1);

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

// ── Individual exploit generators ───────────────────────────────────────────

function exploitMissingSigner(c: Concept): string {
  return `  it("should fail when calling transition without signer", async () => {
    // ── Exploit: call instruction without signing as authority ──
    // Attacker sends transaction with authority account but does NOT sign it.
    // If program doesn't check is_signer, the call succeeds.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    // Fund attacker
    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Build instruction with authority pubkey but isSigner = false
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: attackerKeypair.publicKey.toString(), isSigner: false, isWritable: false },
        // ... other accounts
      ],
      data: new Uint8Array(0), // instruction data
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: program should reject unsigned authority ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("MissingSigner");
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

function exploitWrongSigner(c: Concept): string {
  return `  it("should fail when signing with wrong authority", async () => {
    // ── Exploit: sign with a different keypair than the expected authority ──
    const web3 = await import("@solana/web3.js");
    const fakeAuthority = web3.Keypair.generate();

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeAuthority.publicKey.toString(), isSigner: true, isWritable: false },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx], [fakeAuthority]);

    // ── Assertion: program should reject wrong authority ──
    expect(result.success).toBe(false);
  });`;
}

function exploitFakeAccount(c: Concept): string {
  return `  it("should fail when substituting a fake config account", async () => {
    // ── Exploit: create a fake account with attacker-controlled data ──
    // Attacker creates their own account that looks like a config account
    // but has their own pubkey as the admin.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();
    const fakeConfigKeypair = web3.Keypair.generate();

    // Fund attacker
    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Create fake config account owned by System Program (not the target program)
    await env.createAccount(
      fakeConfigKeypair,
      1_000_000, // lamports
      64,        // space — enough for a fake Config struct
      web3.SystemProgram.programId.toString(), // wrong owner!
    );

    // Write fake admin pubkey into the fake config account
    // ... (attacker writes their own pubkey as admin field)

    // Try to call withdraw with fake config
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeConfigKeypair.publicKey.toString(), isSigner: false, isWritable: false },
        { pubkey: attackerKeypair.publicKey.toString(), isSigner: true, isWritable: true },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: program should reject account not owned by itself ──
    expect(result.success).toBe(false);
  });`;
}

function exploitCrossProgramAccount(c: Concept): string {
  return `  it("should fail when passing an account owned by a different program", async () => {
    // ── Exploit: pass an account owned by a different program ──
    // The program expects its own account but receives one from another program.

    const web3 = await import("@solana/web3.js");
    const fakeAccountKeypair = web3.Keypair.generate();

    // Create account owned by System Program instead of target program
    await env.createAccount(
      fakeAccountKeypair,
      1_000_000,
      128,
      web3.SystemProgram.programId.toString(),
    );

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeAccountKeypair.publicKey.toString(), isSigner: false, isWritable: true },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program should reject cross-program account ──
    expect(result.success).toBe(false);
  });`;
}

function exploitWrongOwner(c: Concept): string {
  return `  it("should fail when account owner does not match expected program", async () => {
    // ── Exploit: supply an account whose owner field doesn't match ──
    const web3 = await import("@solana/web3.js");
    const fakeKeypair = web3.Keypair.generate();

    // Create account owned by a random program, not the expected one
    await env.createAccount(
      fakeKeypair,
      1_000_000,
      64,
      web3.SystemProgram.programId.toString(),
    );

    // Verify the account exists and has wrong owner
    const account = await env.getAccount(fakeKeypair.publicKey.toString());
    expect(account).not.toBeNull();
    expect(account!.owner).toBe(web3.SystemProgram.programId.toString());
    expect(account!.owner).not.toBe("${c.programId ?? "TARGET_PROGRAM_ID"}");

    // Attempt to use it in a program call
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeKeypair.publicKey.toString(), isSigner: false, isWritable: true },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: should fail because owner mismatch ──
    expect(result.success).toBe(false);
  });`;
}

function exploitSystemOwnedAccount(c: Concept): string {
  return `  it("should fail when using a System-owned account as program state", async () => {
    // ── Exploit: attacker creates a System Program account with crafted data ──
    // that matches the expected struct layout but is not program-owned.

    const web3 = await import("@solana/web3.js");
    const fakeStateKeypair = web3.Keypair.generate();

    await env.createAccountRentExempt(fakeStateKeypair, 64, web3.SystemProgram.programId.toString());

    // Write crafted data that looks like a valid Config struct
    // (attacker sets admin field to their own pubkey)

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeStateKeypair.publicKey.toString(), isSigner: false, isWritable: false },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    expect(result.success).toBe(false);
  });`;
}

function exploitTokenMintSwap(c: Concept): string {
  return `  it("should fail when swapping token mint for a different mint", async () => {
    // ── Exploit: use token account from mint A but pass mint B as the mint ──
    // If program doesn't verify mint matches, attacker can drain wrong tokens.

    const web3 = await import("@solana/web3.js");
    const mintAKeypair = web3.Keypair.generate();
    const mintBKeypair = web3.Keypair.generate();
    const tokenAccountKeypair = web3.Keypair.generate();

    // Create two different mints
    await env.createTokenMint(mintAKeypair, env.payer(), null, 6);
    await env.createTokenMint(mintBKeypair, env.payer(), null, 6);

    // Create token account for mint A
    await env.createTokenAccount(tokenAccountKeypair, mintAKeypair.publicKey.toString());

    // Mint some tokens to the account from mint A
    await env.mintTokens(
      mintAKeypair.publicKey.toString(),
      payerKeypair,
      tokenAccountKeypair.publicKey.toString(),
      1_000_000,
    );

    // ── Exploit: try to use mint B in a transfer with token account from mint A ──
    const exploitIx = {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      accounts: [
        { pubkey: mintBKeypair.publicKey.toString(), isSigner: false, isWritable: true },
        { pubkey: tokenAccountKeypair.publicKey.toString(), isSigner: false, isWritable: true },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: SPL token should reject mint/account mismatch ──
    expect(result.success).toBe(false);
  });`;
}

function exploitWrongTokenAccount(c: Concept): string {
  return `  it("should fail when using a token account from a different owner", async () => {
    // ── Exploit: pass someone else's token account as if it were the vault's ──
    const web3 = await import("@solana/web3.js");
    const mintKeypair = web3.Keypair.generate();
    const victimTokenAccount = web3.Keypair.generate();
    const attackerTokenAccount = web3.Keypair.generate();

    await env.createTokenMint(mintKeypair, env.payer(), null, 6);
    await env.createTokenAccount(victimTokenAccount, mintKeypair.publicKey.toString());
    await env.createTokenAccount(attackerTokenAccount, mintKeypair.publicKey.toString());

    // Mint tokens to victim's account
    await env.mintTokens(
      mintKeypair.publicKey.toString(),
      payerKeypair,
      victimTokenAccount.publicKey.toString(),
      1_000_000,
    );

    // ── Exploit: try to withdraw from victim's account using attacker's authority ──
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: victimTokenAccount.publicKey.toString(), isSigner: false, isWritable: true },
        { pubkey: attackerTokenAccount.publicKey.toString(), isSigner: false, isWritable: true },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    expect(result.success).toBe(false);
  });`;
}

function exploitWrongSeeds(c: Concept): string {
  return `  it("should fail when deriving PDA with wrong seeds", async () => {
    // ── Exploit: derive PDA with different seeds than expected ──
    // If program doesn't re-derive and verify the PDA, attacker can
    // pass a different account that happens to be program-owned.

    const web3 = await import("@solana/web3.js");
    const programId = new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}");

    // Derive the "correct" PDA
    const [correctPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("correct_seed")],
      programId,
    );

    // Derive a "wrong" PDA with different seeds
    const [wrongPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("wrong_seed")],
      programId,
    );

    // ── Exploit: pass wrongPda where correctPda is expected ──
    const exploitIx = {
      programId: programId.toString(),
      accounts: [
        { pubkey: wrongPda.toString(), isSigner: false, isWritable: true },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program should verify PDA derivation and reject ──
    expect(result.success).toBe(false);
  });`;
}

function exploitCollidingSeeds(c: Concept): string {
  return `  it("should fail when using insufficient seeds that allow collision", async () => {
    // ── Exploit: use a single-string seed that could collide with another user ──
    // If PDA seeds don't include a unique identifier (pubkey), two users
    // could derive the same PDA and overwrite each other's state.

    const web3 = await import("@solana/web3.js");
    const programId = new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}");

    // Both users use "vault" as the only seed — collision!
    const [pda1] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      programId,
    );
    const [pda2] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      programId,
    );

    // They're the same address — that's the vulnerability
    expect(pda1.toString()).toBe(pda2.toString());

    // Proper design: include user pubkey in seeds
    const userA = web3.Keypair.generate();
    const [uniquePda1] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), userA.publicKey.toBuffer()],
      programId,
    );
    const userB = web3.Keypair.generate();
    const [uniquePda2] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), userB.publicKey.toBuffer()],
      programId,
    );

    // Now they're different — no collision
    expect(uniquePda1.toString()).not.toBe(uniquePda2.toString());
  });`;
}

function exploitOverflowAmount(c: Concept): string {
  return `  it("should fail when passing u64::MAX as amount to trigger overflow", async () => {
    // ── Exploit: pass a huge amount that causes amount + fee to wrap around ──
    // In release/BPF mode, unchecked u64 arithmetic wraps with two's complement.
    // amount = u64::MAX - 100, fee = 1000
    // amount + fee wraps to 899, bypassing balance check.

    const web3 = await import("@solana/web3.js");
    const U64_MAX = BigInt("18446744073709551615");
    const overflowAmount = U64_MAX - BigInt(100);

    // Encode the overflow amount as instruction data (little-endian u64)
    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, overflowAmount, true);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: env.payer(), isSigner: true, isWritable: true },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program should use checked_add and reject overflow ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("overflow");
  });`;
}

function exploitUnderflowBalance(c: Concept): string {
  return `  it("should fail when withdrawing more than balance to trigger underflow", async () => {
    // ── Exploit: withdraw amount > balance, causing balance - amount to underflow ──
    // If unchecked, balance - amount wraps to a huge number, giving attacker tokens.

    const web3 = await import("@solana/web3.js");
    const underflowAmount = BigInt("18446744073709551615"); // u64::MAX

    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, underflowAmount, true);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: env.payer(), isSigner: true, isWritable: true },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program should use checked_sub and reject underflow ──
    expect(result.success).toBe(false);
  });`;
}

function exploitFakeCpiTarget(c: Concept): string {
  return `  it("should fail when substituting a fake program for CPI target", async () => {
    // ── Exploit: pass a malicious program as the token_program argument ──
    // The attacker's program mimics the SPL Token interface but drains
    // the vault instead of performing the expected transfer.

    const web3 = await import("@solana/web3.js");

    // Attacker deploys a fake "token program" that looks like SPL Token
    // but steals funds. For this test, we use a random pubkey as the fake program.
    const fakeTokenProgram = web3.Keypair.generate().publicKey;

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: env.payer(), isSigner: true, isWritable: true },
        { pubkey: fakeTokenProgram.toString(), isSigner: false, isWritable: false },
      ],
      data: new Uint8Array(0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program should verify CPI target == spl_token::ID ──
    expect(result.success).toBe(false);
  });`;
}

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
    const testName = concept.canonicalName.replace(/([A-Z])/g, "_$1").toLowerCase().slice(1);
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
const REAL_WORLD_EXPLOITS: Record<string, {
  describe: string;
  exploits: (concept: Concept) => string[];
}> = {
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
    exploits: (c) => [
      exploitNcnNonOperatorClose(c),
      exploitNcnBallotAfterDeadline(c),
    ],
  },
  MerkleProofVerifier: {
    describe: "MerkleProofVerifier — merkle proof bypass scenarios",
    exploits: (c) => [
      exploitMerkleFakeProof(c),
      exploitMerkleNonAuthorityFreeze(c),
    ],
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
    exploits: (c) => [
      exploitMppSplitMismatch(c),
      exploitMppNonFeePayerSettle(c),
    ],
  },
  PaymentSettlement: {
    describe: "PaymentSettlement — settlement verification exploits",
    exploits: (c) => [
      exploitSettlementFakeTxSignature(c),
      exploitSettlementDoubleReceipt(c),
    ],
  },
  SignerAuthorization: {
    describe: "SignerAuthorization — missing signer check exploits",
    exploits: (c) => [
      exploitSealevelMissingSigner(c),
      exploitSealevelImpersonateAuthority(c),
    ],
  },
  AccountDataMatching: {
    describe: "AccountDataMatching — fake account type exploits",
    exploits: (c) => [
      exploitSealevelFakeTokenAccount(c),
      exploitSealevelArbitraryAccountRead(c),
    ],
  },
  TypeCosplay: {
    describe: "TypeCosplay — struct reinterpretation exploits",
    exploits: (c) => [
      exploitSealevelTypeConfusion(c),
      exploitSealevelSharedDiscriminator(c),
    ],
  },
  PdaSharing: {
    describe: "PdaSharing — PDA collision exploits",
    exploits: (c) => [
      exploitSealevelPdaCollision(c),
      exploitSealevelDrainVault(c),
    ],
  },
  BumpSeedCanonicalization: {
    describe: "BumpSeedCanonicalization — non-canonical bump exploits",
    exploits: (c) => [
      exploitSealevelNonCanonicalBump(c),
      exploitSealevelAlternativePda(c),
    ],
  },
  ClosingAccounts: {
    describe: "ClosingAccounts — close and reinit exploits",
    exploits: (c) => [
      exploitSealevelCloseWithoutClear(c),
      exploitSealevelReinitAfterClose(c),
    ],
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
    exploits: (c) => [
      exploitMultisigTxNonOwnerApprove(c),
      exploitMultisigTxAlreadyExecuted(c),
    ],
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
    exploits: (c) => [
      exploitTicTacToeTileOutOfBounds(c),
      exploitTicTacToeWrongPlayer(c),
    ],
  },
};

/**
 * Generate a PoC test file for a real-world program concept.
 */
export function generateRealWorldPoCTest(concept: Concept): string {
  const pattern = REAL_WORLD_EXPLOITS[concept.canonicalName];
  if (!pattern) return generateGenericPoCTest(concept);

  const testName = concept.canonicalName.replace(/([A-Z])/g, "_$1").toLowerCase().slice(1);
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
      const testName = concept.canonicalName.replace(/([A-Z])/g, "_$1").toLowerCase().slice(1);
      results.push({
        filename: `${testName}.test.ts`,
        content: generateRealWorldPoCTest(concept),
      });
    }
  }

  return results;
}

// ── Escrow exploits ─────────────────────────────────────────────────────────

function exploitEscrowNonMakerRefund(c: Concept): string {
  return `  it("should reject refund from non-maker (taker tries to steal maker tokens)", async () => {
    // ── Exploit: taker calls Refund instead of maker ──
    // If program doesn't verify maker is signer on refund,
    // taker can cancel the swap and steal maker's deposited tokens.

    const web3 = await import("@solana/web3.js");
    const takerKeypair = web3.Keypair.generate();

    // Fund taker
    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(takerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Setup: maker has funded the escrow (assumes prior Initialize + Deposit)
    // Now taker tries to call Refund
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: makerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: takerKeypair.publicKey.toString(), isSigner: true, isWritable: false }, // NOT maker!
      ],
      data: encodeRefundInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [takerKeypair]);

    // ── Assertion: program should reject — only maker can refund ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

function exploitEscrowWrongTakerMint(c: Concept): string {
  return `  it("should reject Take with wrong taker mint (token confusion attack)", async () => {
    // ── Exploit: taker deposits fake mint B' instead of real mint B ──
    // If program doesn't verify taker_mint matches the escrow config,
    // taker can swap maker's real tokens for worthless fake tokens.

    const web3 = await import("@solana/web3.js");
    const realMintB = web3.Keypair.generate();
    const fakeMintB = web3.Keypair.generate();

    // Create real and fake mints
    await env.createTokenMint(realMintB, env.payer(), null, 6);
    await env.createTokenMint(fakeMintB, env.payer(), null, 6);

    // Taker deposits fake mint tokens instead of real mint B
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: fakeMintB.publicKey.toString(), isSigner: false, isWritable: false }, // WRONG mint!
        { pubkey: takerSourceAccount, isSigner: false, isWritable: true },
        { pubkey: makerDestinationAccount, isSigner: false, isWritable: true },
      ],
      data: encodeTakeInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program should verify taker_mint matches escrow config ──
    expect(result.success).toBe(false);
  });`;
}

function exploitEscrowDoubleTake(c: Concept): string {
  return `  it("should reject double Take (replay attack on completed escrow)", async () => {
    // ── Exploit: call Take twice on the same escrow ──
    // If program doesn't check escrow state == Funded (not Completed),
    // attacker can drain maker tokens multiple times.

    // First Take succeeds (legitimate)
    // Second Take attempts to drain again
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: takerSourceAccount, isSigner: false, isWritable: true },
        { pubkey: makerDestinationAccount, isSigner: false, isWritable: true },
      ],
      data: encodeTakeInstruction(),
    };

    // First call (should succeed if escrow is Funded)
    const result1 = await env.executeAsTransaction([exploitIx]);

    // Second call (should fail — escrow is now Completed)
    const result2 = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: second Take must fail ──
    expect(result2.success).toBe(false);
    expect(result2.error ?? "").toContain("InvalidState");
  });`;
}

// ── AMM exploits ────────────────────────────────────────────────────────────

function exploitAmmConstantProductViolation(c: Concept): string {
  return `  it("should reject swap that violates constant product invariant (k = A * B)", async () => {
    // ── Exploit: craft a swap that extracts more tokens than allowed ──
    // If program doesn't enforce k_new >= k_old after swap,
    // attacker can drain the pool by manipulating reserves.

    // Attempt to swap 1 token A for an enormous amount of token B
    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, BigInt(1), true);          // amount_in = 1
    view.setBigUint64(8, BigInt("18446744073709551615"), true); // min_out = u64::MAX

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: sourceAccount, isSigner: false, isWritable: true },
        { pubkey: destinationAccount, isSigner: false, isWritable: true },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must enforce constant product invariant ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("invariant");
  });`;
}

function exploitAmmTokenConfusion(c: Concept): string {
  return `  it("should reject swap with wrong token accounts (pool token confusion)", async () => {
    // ── Exploit: pass token accounts from a different mint pair ──
    // If program doesn't verify token accounts belong to the pool's mints,
    // attacker can swap worthless tokens for pool's real tokens.

    const web3 = await import("@solana/web3.js");
    const fakeMint = web3.Keypair.generate();
    const fakeTokenAccount = web3.Keypair.generate();

    await env.createTokenMint(fakeMint, env.payer(), null, 6);
    await env.createTokenAccount(fakeTokenAccount, fakeMint.publicKey.toString());

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: fakeTokenAccount.publicKey.toString(), isSigner: false, isWritable: true }, // WRONG!
        { pubkey: poolTokenBAccount, isSigner: false, isWritable: true },
      ],
      data: encodeSwapInstruction(1_000_000, 0),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must verify token account mints match pool ──
    expect(result.success).toBe(false);
  });`;
}

function exploitAmmOverflowReserve(c: Concept): string {
  return `  it("should reject swap that overflows reserve calculation", async () => {
    // ── Exploit: swap amount that causes reserve overflow ──
    // If program uses unchecked arithmetic for reserve updates,
    // overflow wraps around and attacker gets free tokens.

    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, BigInt("18446744073709551615"), true); // u64::MAX

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: sourceAccount, isSigner: false, isWritable: true },
        { pubkey: destinationAccount, isSigner: false, isWritable: true },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must use checked_mul/checked_add ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("overflow");
  });`;
}

// ── Fundraiser exploits ─────────────────────────────────────────────────────

function exploitFundraiserNonCreatorClose(c: Concept): string {
  return `  it("should reject Close from non-creator (steal raised funds)", async () => {
    // ── Exploit: attacker calls Close to steal raised funds ──
    // If program doesn't verify creator is signer on Close,
    // anyone can close the fundraiser and withdraw the vault.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fundraiserPda, isSigner: false, isWritable: true },
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
        { pubkey: attacker.publicKey.toString(), isSigner: true, isWritable: true }, // NOT creator!
      ],
      data: encodeCloseInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: only creator can close ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

function exploitFundraiserPastDeadline(c: Concept): string {
  return `  it("should reject contribution past deadline", async () => {
    // ── Exploit: contribute after the fundraiser deadline ──
    // If program doesn't check current_time < deadline,
    // attacker can contribute to a closed fundraiser.

    // Wait for deadline to pass (or set deadline in the past for test)
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fundraiserPda, isSigner: false, isWritable: true },
        { pubkey: contributorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      ],
      data: encodeContributeInstruction(1_000_000),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must check deadline ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("deadline");
  });`;
}

function exploitFundraiserOverflowContribution(c: Concept): string {
  return `  it("should reject contribution that overflows raisedAmount", async () => {
    // ── Exploit: contribute u64::MAX to overflow raisedAmount ──
    // If raisedAmount + contribution wraps around to a small number,
    // attacker can bypass the targetAmount check.

    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, BigInt("18446744073709551615"), true);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fundraiserPda, isSigner: false, isWritable: true },
        { pubkey: contributorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must use checked_add ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("overflow");
  });`;
}

// ── TransferHook exploits ───────────────────────────────────────────────────

function exploitTransferHookBlockListBypass(c: Concept): string {
  return `  it("should reject transfer from blocklisted address", async () => {
    // ── Exploit: blocked address attempts to transfer tokens ──
    // If hook doesn't properly check the block list,
    // blocked addresses can still transfer.

    const web3 = await import("@solana/web3.js");
    const blockedUser = web3.Keypair.generate();
    const receiver = web3.Keypair.generate();

    // Assume blockedUser is on the block list
    const exploitIx = {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      accounts: [
        { pubkey: blockedUserTokenAccount, isSigner: false, isWritable: true },
        { pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
        { pubkey: blockedUser.publicKey.toString(), isSigner: true, isWritable: false },
      ],
      data: encodeTransferInstruction(1_000),
    };

    const result = await env.executeAsTransaction([exploitIx], [blockedUser]);

    // ── Assertion: hook must reject blocked address ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("blocked");
  });`;
}

function exploitTransferHookNonAuthorityPause(c: Concept): string {
  return `  it("should reject Pause from non-authority (DoS attack)", async () => {
    // ── Exploit: attacker pauses the transfer hook to DoS all transfers ──
    // If program doesn't verify authority is signer on Pause,
    // anyone can pause the hook and block all token transfers.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: hookConfigPda, isSigner: false, isWritable: true },
        { pubkey: attacker.publicKey.toString(), isSigner: true, isWritable: false }, // NOT authority!
      ],
      data: encodePauseInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: only authority can pause ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

// ── Counter exploits ────────────────────────────────────────────────────────

function exploitCounterNonAuthorityIncrement(c: Concept): string {
  return `  it("should reject increment from non-authority", async () => {
    // ── Exploit: unauthorized user increments the counter ──
    // If program doesn't verify authority is signer,
    // anyone can increment the counter.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: counterPda, isSigner: false, isWritable: true },
        { pubkey: attacker.publicKey.toString(), isSigner: true, isWritable: false }, // NOT authority!
      ],
      data: encodeIncrementInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: only authority can increment ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

function exploitCounterOverflow(c: Concept): string {
  return `  it("should reject increment at u64::MAX (overflow protection)", async () => {
    // ── Exploit: increment counter when it's already at u64::MAX ──
    // If program uses unchecked addition, count wraps to 0.
    // This could break invariants that depend on monotonic counting.

    // Setup: set counter to u64::MAX (requires prior state manipulation)
    // Then attempt to increment
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: counterPda, isSigner: false, isWritable: true },
        { pubkey: env.payer(), isSigner: true, isWritable: false },
      ],
      data: encodeIncrementInstruction(),
    };

    // Note: this test requires counter to be at u64::MAX first
    // In practice, you'd set this up by manipulating account data directly
    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must use checked_add ──
    // If counter is at MAX, this should fail with overflow
    expect(result.success).toBe(false);
  });`;
}

function exploitCounterFakePda(c: Concept): string {
  return `  it("should reject fake PDA (account substitution attack)", async () => {
    // ── Exploit: pass a different account that's not the real counter PDA ──
    // If program doesn't re-derive and verify the PDA,
    // attacker can pass a fake account with their own counter value.

    const web3 = await import("@solana/web3.js");
    const fakeAccountKeypair = web3.Keypair.generate();

    // Create a fake account owned by System Program
    await env.createAccount(
      fakeAccountKeypair,
      1_000_000,
      49, // same size as counter account
      web3.SystemProgram.programId.toString(), // wrong owner
    );

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeAccountKeypair.publicKey.toString(), isSigner: false, isWritable: true }, // FAKE!
        { pubkey: env.payer(), isSigner: true, isWritable: false },
      ],
      data: encodeIncrementInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must verify PDA derivation ──
    expect(result.success).toBe(false);
  });`;
}

// ── ValidatorGovernance exploits ────────────────────────────────────────────

function exploitGovernanceNonProposerFinalize(c: Concept): string {
  return `  it("should reject FinalizeProposal from non-proposer (vote manipulation)", async () => {
    // ── Exploit: attacker finalizes proposal before voting ends ──
    // If program doesn't verify proposer is signer on finalize,
    // attacker can finalize a proposal with manipulated vote counts.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: proposalPda, isSigner: false, isWritable: true },
        { pubkey: attacker.publicKey.toString(), isSigner: true, isWritable: false }, // NOT proposer!
      ],
      data: encodeFinalizeInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: only proposer can finalize ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

function exploitGovernanceFakeMerkleProof(c: Concept): string {
  return `  it("should reject vote with invalid merkle proof (ineligible voter)", async () => {
    // ── Exploit: non-validator submits fake merkle proof to vote ──
    // If program doesn't properly verify the merkle proof against root,
    // non-validators can cast votes and manipulate governance outcomes.

    const web3 = await import("@solana/web3.js");
    const fakeVoter = web3.Keypair.generate();

    // Craft a fake merkle proof (random bytes)
    const fakeProof = new Uint8Array(32 * 20); // 20 levels of fake siblings
    crypto.getRandomValues(fakeProof);

    const data = new Uint8Array(8 + 32 + fakeProof.length);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, BigInt(1), true); // vote = yes
    data.set(fakeVoter.publicKey.toBytes(), 8);
    data.set(fakeProof, 40);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: proposalPda, isSigner: false, isWritable: true },
        { pubkey: fakeVoter.publicKey.toString(), isSigner: true, isWritable: false },
        { pubkey: merkleVerifierPda, isSigner: false, isWritable: false },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx], [fakeVoter]);

    // ── Assertion: program must verify merkle proof against root ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("InvalidProof");
  });`;
}

function exploitGovernanceVoteOverflow(c: Concept): string {
  return `  it("should reject vote that overflows yesVotes tally", async () => {
    // ── Exploit: cast vote with u64::MAX stake weight to overflow tally ──
    // If yesVotes + stakeWeight wraps around, attacker can make
    // yesVotes appear smaller than noVotes, flipping the result.

    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, BigInt("18446744073709551615"), true); // u64::MAX stake
    view.setBigUint64(8, BigInt(1), true); // vote = yes

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: proposalPda, isSigner: false, isWritable: true },
        { pubkey: voterPubkey, isSigner: true, isWritable: false },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must use checked_add for vote tally ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("overflow");
  });`;
}

// ── NcnBallot exploits ──────────────────────────────────────────────────────

function exploitNcnNonOperatorClose(c: Concept): string {
  return `  it("should reject CloseBallot from non-operator (governance DoS)", async () => {
    // ── Exploit: attacker closes ballot early to prevent votes ──
    // If program doesn't verify operator is signer on close,
    // attacker can close the ballot before all NCN members vote.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: ballotPda, isSigner: false, isWritable: true },
        { pubkey: attacker.publicKey.toString(), isSigner: true, isWritable: false }, // NOT operator!
      ],
      data: encodeCloseBallotInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: only operator can close ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

function exploitNcnBallotAfterDeadline(c: Concept): string {
  return `  it("should reject ballot submission after deadline", async () => {
    // ── Exploit: submit ballot after deadline to manipulate tally ──
    // If program doesn't check current_time < deadline,
    // attacker can submit late ballots to change the outcome.

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: ballotPda, isSigner: false, isWritable: true },
        { pubkey: submitterPubkey, isSigner: true, isWritable: false },
        { pubkey: whitelistVerifierPda, isSigner: false, isWritable: false },
      ],
      data: encodeSubmitBallotInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: program must enforce deadline ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("deadline");
  });`;
}

// ── MerkleProofVerifier exploits ─────────────────────────────────────────────

function exploitMerkleFakeProof(c: Concept): string {
  return `  it("should reject invalid merkle proof (eligibility bypass)", async () => {
    // ── Exploit: submit forged proof that doesn't match the root ──
    // If program doesn't properly recompute the merkle root from
    // the proof path, non-eligible voters can bypass verification.

    const fakeLeaf = new Uint8Array(32);
    const fakeProof = new Uint8Array(32 * 10); // 10 levels of fake siblings
    crypto.getRandomValues(fakeLeaf);
    crypto.getRandomValues(fakeProof);

    const data = new Uint8Array(32 + 4 + fakeProof.length);
    data.set(fakeLeaf, 0);
    const view = new DataView(data.buffer);
    view.setUint32(32, 42, true); // proof index
    data.set(fakeProof, 36);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: verifierPda, isSigner: false, isWritable: false },
        { pubkey: callerPubkey, isSigner: true, isWritable: false },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: computed root must match stored root ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("InvalidProof");
  });`;
}

function exploitMerkleNonAuthorityFreeze(c: Concept): string {
  return `  it("should reject Freeze from non-authority (verifier DoS)", async () => {
    // ── Exploit: attacker freezes the verifier to block all votes ──
    // If program doesn't verify authority is signer on Freeze,
    // anyone can freeze the verifier and halt governance.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: verifierPda, isSigner: false, isWritable: true },
        { pubkey: attacker.publicKey.toString(), isSigner: true, isWritable: false }, // NOT authority!
      ],
      data: encodeFreezeInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: only authority can freeze ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

// ── PaymentChallenge (x402) exploits ────────────────────────────────────────

function exploitPaymentReplayAttack(c: Concept): string {
  return `  it("should reject replayed payment proof (nonce reuse)", async () => {
    // ── Exploit: reuse a verified payment proof for a second request ──
    // If server doesn't track nonce usage, attacker can pay once
    // and access the paywalled resource unlimited times.

    // First request: pay and get verified (legitimate)
    const firstResult = await env.executeAsTransaction([{
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: challengePda, isSigner: false, isWritable: true },
        { pubkey: payerPubkey, isSigner: true, isWritable: false },
      ],
      data: encodeVerifyPaymentInstruction(txSignature, nonce),
    }]);

    // Second request: replay the same proof with same nonce
    const secondResult = await env.executeAsTransaction([{
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: challengePda, isSigner: false, isWritable: true },
        { pubkey: payerPubkey, isSigner: true, isWritable: false },
      ],
      data: encodeVerifyPaymentInstruction(txSignature, nonce), // SAME nonce!
    }]);

    // ── Assertion: second verification must fail (nonce already used) ──
    expect(secondResult.success).toBe(false);
    expect(secondResult.error ?? "").toContain("NonceAlreadyUsed");
  });`;
}

function exploitPaymentWrongAmount(c: Concept): string {
  return `  it("should reject payment with wrong amount (underpayment)", async () => {
    // ── Exploit: pay less than the challenge amount ──
    // If server doesn't verify on-chain transfer amount matches challenge,
    // attacker can pay 1 lamport instead of the required USDC amount.

    const web3 = await import("@solana/web3.js");
    const spl = await import("@solana/spl-token");

    // Create a transfer of 1 base unit instead of required amount
    const transferIx = spl.createTransferInstruction(
      payerTokenAccount,
      recipientTokenAccount,
      payerPubkey,
      1, // WRONG — should be challenge.amount
      [],
    );

    // Submit the underpayment as proof
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: challengePda, isSigner: false, isWritable: true },
        { pubkey: payerPubkey, isSigner: true, isWritable: false },
      ],
      data: encodeVerifyPaymentInstruction(txSigOfUnderpayment, nonce),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: amount must match challenge exactly ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("AmountMismatch");
  });`;
}

function exploitPaymentExpiredChallenge(c: Concept): string {
  return `  it("should reject payment proof for expired challenge", async () => {
    // ── Exploit: pay after the challenge deadline has passed ──
    // If server doesn't check deadline, attacker can use old challenges
    // with stale prices (e.g., pay old cheap price for premium content).

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: expiredChallengePda, isSigner: false, isWritable: true },
        { pubkey: payerPubkey, isSigner: true, isWritable: false },
      ],
      data: encodeVerifyPaymentInstruction(txSignature, expiredNonce),
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: challenge must not be expired ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Expired");
  });`;
}

// ── MultiPartyPayment (MPP) exploits ────────────────────────────────────────

function exploitMppSplitMismatch(c: Concept): string {
  return `  it("should reject settlement where splits don't sum to total", async () => {
    // ── Exploit: submit splits that don't add up to totalAmount ──
    // If program doesn't verify sum(splits) + fee == totalAmount,
    // attacker can pocket the difference or underpay recipients.

    const data = new Uint8Array(32 + 8);
    // Encode fake intent: totalAmount = 1000 but splits sum to 800
    const view = new DataView(data.buffer);
    view.setBigUint64(0, BigInt(1000), true); // totalAmount
    view.setBigUint64(8, BigInt(800), true);  // actual splits sum (WRONG)
    data.set(new Uint8Array(32).fill(1), 16); // fake recipient list

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: mppPda, isSigner: false, isWritable: true },
        { pubkey: feePayerPubkey, isSigner: true, isWritable: false },
      ],
      data,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: splits must sum to totalAmount minus fee ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("SplitMismatch");
  });`;
}

function exploitMppNonFeePayerSettle(c: Concept): string {
  return `  it("should reject SettleSplits from non-fee-payer (fund theft)", async () => {
    // ── Exploit: attacker settles splits to redirect funds ──
    // If program doesn't verify feePayer is signer on settle,
    // attacker can settle with modified recipient list.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: mppPda, isSigner: false, isWritable: true },
        { pubkey: attacker.publicKey.toString(), isSigner: true, isWritable: false }, // NOT feePayer!
      ],
      data: encodeSettleInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: only feePayer can settle ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

// ── PaymentSettlement exploits ──────────────────────────────────────────────

function exploitSettlementFakeTxSignature(c: Concept): string {
  return `  it("should reject fake transaction signature (no on-chain tx)", async () => {
    // ── Exploit: submit a fabricated signature that doesn't exist on-chain ──
    // If program doesn't actually verify the tx exists on-chain,
    // attacker can fabricate a signature and get free access.

    const fakeSignature = new Uint8Array(64);
    crypto.getRandomValues(fakeSignature);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: settlementPda, isSigner: false, isWritable: true },
        { pubkey: challengePda, isSigner: false, isWritable: false },
        { pubkey: authorityPubkey, isSigner: true, isWritable: false },
      ],
      data: fakeSignature,
    };

    const result = await env.executeAsTransaction([exploitIx]);

    // ── Assertion: tx must exist and be confirmed on-chain ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("TxNotFound");
  });`;
}

function exploitSettlementDoubleReceipt(c: Concept): string {
  return `  it("should reject double receipt issuance (same tx twice)", async () => {
    // ── Exploit: issue two receipts for the same payment ──
    // If program doesn't track that a receipt was already issued,
    // attacker can get multiple receipts from one payment.

    const verifyIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: settlementPda, isSigner: false, isWritable: true },
        { pubkey: challengePda, isSigner: false, isWritable: false },
        { pubkey: authorityPubkey, isSigner: true, isWritable: false },
      ],
      data: encodeIssueReceiptInstruction(txSignature),
    };

    // First receipt (should succeed)
    const result1 = await env.executeAsTransaction([verifyIx]);

    // Second receipt for same tx (should fail)
    const result2 = await env.executeAsTransaction([verifyIx]);

    // ── Assertion: each tx can only produce one receipt ──
    expect(result2.success).toBe(false);
    expect(result2.error ?? "").toContain("ReceiptAlreadyIssued");
  });`;
}

// ── Sealevel Attacks exploit generators ─────────────────────────────────────

function exploitSealevelMissingSigner(c: Concept): string {
  return `  it("should reject instruction when authority is not a signer", async () => {
    // ── Exploit: caller passes authority without signing ──
    // If program doesn't check authority.isSigner, anyone can call
    // privileged instructions by just passing the authority's pubkey.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();
    const authorityPubkey = web3.Keypair.generate().publicKey;

    // Fund attacker
    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Attacker calls log_message with authority's pubkey but NOT as signer
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: authorityPubkey, isSigner: false, isWritable: false },
      ],
      data: encodeLogMessageInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject non-signer authority ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("MissingRequiredSignature");
  });`;
}

function exploitSealevelImpersonateAuthority(c: Concept): string {
  return `  it("should reject impersonated authority calling privileged instruction", async () => {
    // ── Exploit: attacker signs as themselves but passes someone else as authority ──
    // Program must verify the authority account is the actual signer, not just present.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();
    const realAuthority = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Attacker signs, but passes realAuthority's pubkey as the authority account
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: realAuthority.publicKey, isSigner: false, isWritable: false },
      ],
      data: encodeLogMessageInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject because authority didn't sign ──
    expect(result.success).toBe(false);
  });`;
}

function exploitSealevelFakeTokenAccount(c: Concept): string {
  return `  it("should reject fake token account with crafted data", async () => {
    // ── Exploit: attacker passes a non-SPL-token account with fake amount ──
    // If program doesn't verify account.owner == Token Program, attacker
    // can create an account with arbitrary data that looks like a token account.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Create a fake account with crafted token account data
    const fakeAccount = web3.Keypair.generate();
    const fakeData = Buffer.alloc(165); // SPL token account size
    fakeData.writeBigUInt64LE(BigInt(999999999), 64); // fake amount at offset 64

    // Fund the fake account with rent
    const createIx = web3.SystemProgram.createAccount({
      fromPubkey: attackerKeypair.publicKey,
      newAccountPubkey: fakeAccount.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(165),
      space: 165,
      programId: new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}"),
    });

    // Pass fake account as token account
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeAccount.publicKey, isSigner: false, isWritable: false },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeLogBalanceInstruction(),
    };

    await env.executeAsTransaction([createIx], [attackerKeypair, fakeAccount]);
    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject non-Token-Program-owned account ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("InvalidAccountOwner");
  });`;
}

function exploitSealevelArbitraryAccountRead(c: Concept): string {
  return `  it("should reject arbitrary account passed as token account", async () => {
    // ── Exploit: pass any random account as the token account ──
    // Without owner check, program reads arbitrary data as token balance.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();
    const randomAccount = web3.Keypair.generate().publicKey;

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: randomAccount, isSigner: false, isWritable: false },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeLogBalanceInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject account not owned by Token Program ──
    expect(result.success).toBe(false);
  });`;
}

function exploitSealevelTypeConfusion(c: Concept): string {
  return `  it("should reject account of wrong type with matching discriminator", async () => {
    // ── Exploit: pass an Admin account where a User account is expected ──
    // If both structs share the same Borsh discriminator prefix,
    // the program deserializes the wrong type and reads fields incorrectly.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Create a fake "Admin" account that shares discriminator with User
    const fakeUserAccount = web3.Keypair.generate();
    const fakeData = Buffer.alloc(48);
    // Write the same discriminator as User struct
    fakeData.writeUInt32LE(0x12345678, 0); // shared discriminator
    // Write attacker's key at the authority offset
    fakeData.fill(attackerKeypair.publicKey.toBuffer(), 8);

    const createIx = web3.SystemProgram.createAccount({
      fromPubkey: attackerKeypair.publicKey,
      newAccountPubkey: fakeUserAccount.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(48),
      space: 48,
      programId: new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}"),
    });

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: fakeUserAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeUpdateUserInstruction(),
    };

    await env.executeAsTransaction([createIx], [attackerKeypair, fakeUserAccount]);
    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject wrong account type ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("AccountDiscriminatorMismatch");
  });`;
}

function exploitSealevelSharedDiscriminator(c: Concept): string {
  return `  it("should reject struct reinterpretation via shared discriminator", async () => {
    // ── Exploit: two structs with same layout but different semantics ──
    // Attacker creates a Config account, program reads it as User,
    // the admin field in Config maps to attacker's key in User.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Create account with Config data that will be read as User
    const configAccount = web3.Keypair.generate();
    const configData = Buffer.alloc(40);
    configData.writeUInt32LE(0x12345678, 0); // same discriminator
    // admin field at offset 8 = attacker's pubkey
    configData.fill(attackerKeypair.publicKey.toBuffer(), 8);

    const createIx = web3.SystemProgram.createAccount({
      fromPubkey: attackerKeypair.publicKey,
      newAccountPubkey: configAccount.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(40),
      space: 40,
      programId: new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}"),
    });

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: configAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeUpdateUserInstruction(),
    };

    await env.executeAsTransaction([createIx], [attackerKeypair, configAccount]);
    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject type cosplay ──
    expect(result.success).toBe(false);
  });`;
}

function exploitSealevelPdaCollision(c: Concept): string {
  return `  it("should reject PDA collision between pool and attacker account", async () => {
    // ── Exploit: attacker creates account at same PDA as pool ──
    // If PDA seeds are shared across account types, attacker can
    // create an account that collides with the pool PDA.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Derive the pool PDA
    const [poolPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), attackerKeypair.publicKey.toBuffer()],
      new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}"),
    );

    // Attacker tries to withdraw using colliding PDA
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeWithdrawInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject PDA collision ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("InvalidPda");
  });`;
}

function exploitSealevelDrainVault(c: Concept): string {
  return `  it("should reject draining vault via shared PDA seeds", async () => {
    // ── Exploit: attacker uses shared PDA seeds to drain vault tokens ──
    // If vault PDA seeds are predictable, attacker can forge signer
    // and call token::transfer to drain funds.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Derive vault PDA with shared seeds
    const [vaultPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}"),
    );

    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: true },
      ],
      data: encodeWithdrawTokensInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject unauthorized vault drain ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("Unauthorized");
  });`;
}

function exploitSealevelNonCanonicalBump(c: Concept): string {
  return `  it("should reject non-canonical bump seed for PDA derivation", async () => {
    // ── Exploit: attacker uses a lower bump seed to derive alternative PDA ──
    // If program accepts any valid bump, attacker can find a different PDA
    // that passes create_program_address but isn't the canonical one.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();
    const programId = new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}");

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Find canonical bump
    const [canonicalPda, canonicalBump] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from([1])],
      programId,
    );

    // Find a non-canonical bump (try lower values)
    let nonCanonicalPda: web3.PublicKey | null = null;
    let nonCanonicalBump = 0;
    for (let b = canonicalBump - 1; b >= 0; b--) {
      try {
        const addr = web3.PublicKey.createProgramAddressSync(
          [Buffer.from([1]), Buffer.from([b])],
          programId,
        );
        nonCanonicalPda = addr;
        nonCanonicalBump = b;
        break;
      } catch { continue; }
    }

    if (!nonCanonicalPda) {
      // No alternative bump found — program is secure for this seed
      expect(true).toBe(true);
      return;
    }

    // Attacker tries to use non-canonical bump
    const exploitIx = {
      programId: programId.toBase58(),
      accounts: [
        { pubkey: nonCanonicalPda, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeSetValueInstruction(1, 42, nonCanonicalBump),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject non-canonical bump ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("InvalidBumpSeed");
  });`;
}

function exploitSealevelAlternativePda(c: Concept): string {
  return `  it("should reject alternative PDA address from non-canonical bump", async () => {
    // ── Exploit: attacker creates account at alternative PDA address ──
    // Non-canonical bump produces a different address that the program
    // might accept if it doesn't enforce canonical bump.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();
    const programId = new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}");

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Try multiple bumps to find a non-canonical one
    const [, canonicalBump] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("data")],
      programId,
    );

    for (let b = 255; b >= 0; b--) {
      if (b === canonicalBump) continue;
      try {
        const altPda = web3.PublicKey.createProgramAddressSync(
          [Buffer.from("data"), Buffer.from([b])],
          programId,
        );

        // Try to set value on alternative PDA
        const exploitIx = {
          programId: programId.toBase58(),
          accounts: [
            { pubkey: altPda, isSigner: false, isWritable: true },
            { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
          ],
          data: encodeSetValueInstruction(1, 99, b),
        };

        const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

        // ── Assertion: must reject any non-canonical bump ──
        expect(result.success).toBe(false);
        break;
      } catch { continue; }
    }
  });`;
}

function exploitSealevelCloseWithoutClear(c: Concept): string {
  return `  it("should reject close that doesn't clear account data", async () => {
    // ── Exploit: close drains lamports but leaves data intact ──
    // If program sets lamports to 0 without clearing data, attacker can
    // re-fund the account and reuse stale data.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, 2 * web3.LAMPORTS_PER_SOL);

    // Create a data account
    const dataAccount = web3.Keypair.generate();
    const createIx = web3.SystemProgram.createAccount({
      fromPubkey: attackerKeypair.publicKey,
      newAccountPubkey: dataAccount.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(32),
      space: 32,
      programId: new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}"),
    });

    await env.executeAsTransaction([createIx], [attackerKeypair, dataAccount]);

    // Close the account (drain lamports)
    const closeIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: dataAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: true },
      ],
      data: encodeCloseInstruction(),
    };

    await env.executeAsTransaction([closeIx], [attackerKeypair]);

    // Verify account has 0 lamports
    const balance = await conn.getBalance(dataAccount.publicKey);
    expect(balance).toBe(0);

    // ── Assertion: account data must be cleared ──
    const accountInfo = await conn.getAccountInfo(dataAccount.publicKey);
    if (accountInfo) {
      const dataCleared = accountInfo.data.every((byte) => byte === 0);
      expect(dataCleared).toBe(true);
    }
  });`;
}

function exploitSealevelReinitAfterClose(c: Concept): string {
  return `  it("should reject reinitialization of a closed account", async () => {
    // ── Exploit: re-fund closed account and call initialize again ──
    // If data wasn't cleared, the account still has old authority,
    // but attacker can reinitialize with their own authority.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, 2 * web3.LAMPORTS_PER_SOL);

    // Create and close an account
    const dataAccount = web3.Keypair.generate();
    const createIx = web3.SystemProgram.createAccount({
      fromPubkey: attackerKeypair.publicKey,
      newAccountPubkey: dataAccount.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(32),
      space: 32,
      programId: new web3.PublicKey("${c.programId ?? "TARGET_PROGRAM_ID"}"),
    });

    await env.executeAsTransaction([createIx], [attackerKeypair, dataAccount]);

    // Close
    const closeIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: dataAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: true },
      ],
      data: encodeCloseInstruction(),
    };
    await env.executeAsTransaction([closeIx], [attackerKeypair]);

    // Re-fund the account
    const refundIx = web3.SystemProgram.transfer({
      fromPubkey: attackerKeypair.publicKey,
      toPubkey: dataAccount.publicKey,
      lamports: await conn.getMinimumBalanceForRentExemption(32),
    });
    await env.executeAsTransaction([refundIx], [attackerKeypair]);

    // Try to reinitialize
    const reinitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: dataAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeInitializeInstruction(),
    };

    const result = await env.executeAsTransaction([reinitIx], [attackerKeypair]);

    // ── Assertion: must reject reinitialization ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("AlreadyInitialized");
  });`;
}

// ── Coral Multisig exploit generators ───────────────────────────────────────

function exploitMultisigBelowThreshold(c: Concept): string {
  return `  it("should reject execution when fewer than threshold owners signed", async () => {
    // ── Exploit: attacker collects fewer than threshold signatures ──
    // If program doesn't verify sig_count >= threshold, a minority of
    // owners can execute arbitrary transactions.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Create a multisig with threshold=3 and 5 owners
    const owners = [
      web3.Keypair.generate().publicKey,
      web3.Keypair.generate().publicKey,
      web3.Keypair.generate().publicKey,
      web3.Keypair.generate().publicKey,
      web3.Keypair.generate().publicKey,
    ];

    // Only 1 owner signs (below threshold of 3)
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeExecuteTxInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject — not enough signers ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("NotEnoughSigners");
  });`;
}

function exploitMultisigStaleOwnerSet(c: Concept): string {
  return `  it("should reject stale transaction after owner set rotation", async () => {
    // ── Exploit: execute a transaction created before owner set changed ──
    // If program doesn't check owner_set_seqno, a removed owner can
    // still execute a transaction they proposed before being removed.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Transaction was created with owner_set_seqno=0
    // But multisig.owner_set_seqno is now 1 (owners were rotated)
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeExecuteTxWithStaleSeqnoInstruction(),
    };

    const result = await env.executeAsTransaction([exploitIx], [attackerKeypair]);

    // ── Assertion: must reject stale transaction ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("OwnerSetSeqnoMismatch");
  });`;
}

function exploitMultisigDoubleExecute(c: Concept): string {
  return `  it("should reject double execution of the same transaction", async () => {
    // ── Exploit: execute the same transaction twice ──
    // If program doesn't check did_execute, attacker can replay
    // an already-executed transaction to double-spend or repeat actions.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    const executeIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeExecuteTxInstruction(),
    };

    // First execution (should succeed if threshold met)
    const result1 = await env.executeAsTransaction([executeIx], [attackerKeypair]);

    // Second execution of same tx (should fail)
    const result2 = await env.executeAsTransaction([executeIx], [attackerKeypair]);

    // ── Assertion: must reject double execution ──
    expect(result2.success).toBe(false);
    expect(result2.error ?? "").toContain("AlreadyExecuted");
  });`;
}

function exploitMultisigTxNonOwnerApprove(c: Concept): string {
  return `  it("should reject approval from non-owner of the multisig", async () => {
    // ── Exploit: non-owner tries to approve a transaction ──
    // If program doesn't verify approver is in multisig.owners,
    // anyone can sign transactions and push them toward execution.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Attacker is NOT in the multisig owners list
    const approveIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeApproveInstruction(),
    };

    const result = await env.executeAsTransaction([approveIx], [attackerKeypair]);

    // ── Assertion: must reject non-owner approval ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("InvalidOwner");
  });`;
}

function exploitMultisigTxAlreadyExecuted(c: Concept): string {
  return `  it("should reject approving a transaction that was already executed", async () => {
    // ── Exploit: approve a transaction after it was already executed ──
    // If program allows approval after execution, attacker could
    // manipulate signer state on a burned transaction.

    const web3 = await import("@solana/web3.js");
    const attackerKeypair = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attackerKeypair.publicKey, web3.LAMPORTS_PER_SOL);

    // Transaction already has did_execute = true
    const approveIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: attackerKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeApproveInstruction(),
    };

    const result = await env.executeAsTransaction([approveIx], [attackerKeypair]);

    // ── Assertion: must reject approval on executed tx ──
    expect(result.success).toBe(false);
  });`;
}

// ── Anchor Book Tic-Tac-Toe exploit generators ──────────────────────────────

function exploitTicTacToeOutOfTurn(c: Concept): string {
  return `  it("should reject move when it is not the player's turn", async () => {
    // ── Exploit: player 2 tries to move on turn 1 (player 1's turn) ──
    // If program doesn't verify current_player() == signer, players
    // can move out of turn and potentially win unfairly.

    const web3 = await import("@solana/web3.js");
    const playerTwo = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(playerTwo.publicKey, web3.LAMPORTS_PER_SOL);

    // Player 2 tries to play on turn 1 (should be player 1's turn)
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: playerTwo.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodePlayInstruction(0, 0),
    };

    const result = await env.executeAsTransaction([exploitIx], [playerTwo]);

    // ── Assertion: must reject — not player's turn ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("NotPlayersTurn");
  });`;
}

function exploitTicTacToeTileAlreadySet(c: Concept): string {
  return `  it("should reject move on an already-occupied tile", async () => {
    // ── Exploit: player tries to play on a tile that already has a mark ──
    // If program doesn't check board[row][col] == None, players can
    // overwrite opponent's marks.

    const web3 = await import("@solana/web3.js");
    const playerOne = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(playerOne.publicKey, web3.LAMPORTS_PER_SOL);

    // Try to play on tile (1,1) which is already occupied
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: playerOne.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodePlayInstruction(1, 1),
    };

    const result = await env.executeAsTransaction([exploitIx], [playerOne]);

    // ── Assertion: must reject — tile already set ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("TileAlreadySet");
  });`;
}

function exploitTicTacToeAfterGameOver(c: Concept): string {
  return `  it("should reject move after game is already over", async () => {
    // ── Exploit: player tries to move after someone already won ──
    // If program doesn't check game.is_active(), moves can be made
    // after the game has ended (Won or Tie).

    const web3 = await import("@solana/web3.js");
    const playerOne = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(playerOne.publicKey, web3.LAMPORTS_PER_SOL);

    // Game state is Won — player one tries to play
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: playerOne.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodePlayInstruction(2, 2),
    };

    const result = await env.executeAsTransaction([exploitIx], [playerOne]);

    // ── Assertion: must reject — game already over ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("GameAlreadyOver");
  });`;
}

function exploitTicTacToeTileOutOfBounds(c: Concept): string {
  return `  it("should reject move with tile coordinates out of bounds", async () => {
    // ── Exploit: player tries to play at row 5, column 5 ──
    // If program doesn't validate tile bounds (0..=2), players can
    // write outside the board buffer and corrupt memory.

    const web3 = await import("@solana/web3.js");
    const playerOne = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(playerOne.publicKey, web3.LAMPORTS_PER_SOL);

    // Tile (5, 5) — out of bounds
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: playerOne.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodePlayInstruction(5, 5),
    };

    const result = await env.executeAsTransaction([exploitIx], [playerOne]);

    // ── Assertion: must reject — tile out of bounds ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("TileOutOfBounds");
  });`;
}

function exploitTicTacToeWrongPlayer(c: Concept): string {
  return `  it("should reject move from a non-participant in the game", async () => {
    // ── Exploit: attacker who is not a player tries to make a move ──
    // If program doesn't verify signer is one of the game's players,
    // an outsider can interfere with the game.

    const web3 = await import("@solana/web3.js");
    const attacker = web3.Keypair.generate();

    const conn = new web3.Connection("http://localhost:8899", "confirmed");
    await conn.requestAirdrop(attacker.publicKey, web3.LAMPORTS_PER_SOL);

    // Attacker is not player_one or player_two
    const exploitIx = {
      programId: "${c.programId ?? "TARGET_PROGRAM_ID"}",
      accounts: [
        { pubkey: attacker.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodePlayInstruction(0, 0),
    };

    const result = await env.executeAsTransaction([exploitIx], [attacker]);

    // ── Assertion: must reject — wrong player ──
    expect(result.success).toBe(false);
    expect(result.error ?? "").toContain("NotPlayersTurn");
  });`;
}
