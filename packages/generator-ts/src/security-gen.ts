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
