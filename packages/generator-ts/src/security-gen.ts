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
