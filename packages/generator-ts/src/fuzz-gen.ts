/**
 * Trident Fuzz Test Scaffold Generator
 *
 * Generates Rust fuzz test files compatible with the Trident framework
 * (https://github.com/Ackee-Blockchain/trident) from ontology concepts.
 *
 * Trident uses:
 * - #[init] function for setup
 * - #[flow] functions for instruction sequences
 * - #[invariant] functions for state property checks
 *
 * The generator reads FuzzStrategy, FuzzFlow, and FuzzInvariant concepts
 * and produces a complete Rust fuzz test file.
 */

import type { Concept, StateTransition, ConceptConstraint } from "@solana-ontology/core";

/**
 * Extract fuzzing concepts from a concept list.
 * Groups by canonical name for easy lookup.
 */
export interface FuzzConcepts {
  strategies: Concept[];
  flows: Concept[];
  invariants: Concept[];
}

export function extractFuzzConcepts(concepts: Concept[]): FuzzConcepts {
  const fuzzing = concepts.filter((c) => c.category === "fuzzing");
  return {
    strategies: fuzzing.filter((c) => c.canonicalName === "FuzzStrategy"),
    flows: fuzzing.filter((c) => c.canonicalName === "FuzzFlow"),
    invariants: fuzzing.filter((c) => c.canonicalName === "FuzzInvariant"),
  };
}

/**
 * Find concepts with stateMachine transitions that can be fuzzed.
 * These are the target programs for fuzz test generation.
 */
function findFuzzableConcepts(concepts: Concept[]): Concept[] {
  return concepts.filter(
    (c) =>
      c.category !== "fuzzing" &&
      c.category !== "security" &&
      c.stateMachine?.transitions &&
      c.stateMachine.transitions.length > 0,
  );
}

/**
 * Convert a concept name to a Rust-safe struct name.
 */
function toRustStructName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Convert a transition name to a Rust function name.
 */
function toRustFnName(name: string): string {
  const snake = name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
  return snake.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Generate a complete Trident fuzz test file for a concept with stateMachine.
 * Produces #[init], #[flow] for each transition, and #[invariant] for each constraint.
 */
export function generateTridentFuzzTest(concept: Concept): string {
  const structName = toRustStructName(concept.canonicalName);
  const transitions = concept.stateMachine?.transitions ?? [];
  const constraints = concept.constraints ?? [];

  const initFn = generateInitFunction(concept, structName);
  const flowFns = transitions.map((t) => generateFlowFunction(t, structName)).join("\n\n");
  const invariantFns = constraints
    .map((c) => generateInvariantFunction(c, structName))
    .join("\n\n");

  return `// ── Trident Fuzz Test: ${concept.canonicalName} ──────────────────────────────
// Auto-generated from ontology concept: ${concept.canonicalName}
// Purpose: ${concept.purpose}
//
// Requires: trident-cli (cargo install trident-cli)
// Run: trident fuzz run ${toRustFnName(concept.canonicalName)}_fuzz
//
// Reference: https://ackee.xyz/trident/docs/latest/

use trident_fuzz::fuzz::*;
use trident_client::fuzz_data::FuzzData;
use borsh::BorshSerialize;
use borsh::BorshDeserialize;

/// Fuzz test struct for ${concept.canonicalName}.
/// Holds accounts and state needed across fuzz iterations.
#[derive(Default)]
struct ${structName}Fuzz {
    /// Trident fuzz client
    trident: Client,
    /// Fuzz accounts registry
    fuzz_accounts: FuzzAccounts,
    /// Current state tracking
    current_state: String,
}

${initFn}

${flowFns}

${invariantFns}

// ── Transaction Builders ─────────────────────────────────────────────────────

${transitions.map((t) => generateTransactionBuilder(t, structName)).join("\n\n")}
`;
}

/**
 * Generate the #[init] function that sets up initial state.
 */
function generateInitFunction(concept: Concept, structName: string): string {
  const initTransition = concept.stateMachine?.transitions.find(
    (t) => t.from === concept.stateMachine?.states[0],
  );

  const initIxName = initTransition
    ? toRustFnName(initTransition.via)
    : "initialize";

  return `#[init]
fn start(&mut self) {
    // ── Initialize: set up accounts and execute initial instruction ──
    let mut tx = ${toRustStructName(initTransition?.via ?? "Initialize")}Transaction::build(
        &mut self.trident,
        &mut self.fuzz_accounts,
    );

    // Execute initialization transaction
    self.trident
        .execute_transaction(&mut tx, Some("Initialize"));

    // Set initial state
    self.current_state = "${concept.stateMachine?.states[0] ?? "Idle"}".to_string();
}`;
}

/**
 * Generate a #[flow] function for a state transition.
 */
function generateFlowFunction(t: StateTransition, structName: string): string {
  const fnName = toRustFnName(t.via);
  const txBuilderName = toRustStructName(t.via);

  let preconditionCheck = "";
  if (t.requires) {
    preconditionCheck = `
    // Precondition: ${t.requires}
    // TODO: implement precondition check
    if !self.check_precondition_${fnName}() {
        return; // skip this flow if precondition not met
    }`;
  }

  let authSetup = "";
  if (t.requiresAuth) {
    authSetup = `
    // ── Auth required: ${t.requiresAuth} ──
    // Fuzzer will randomize whether this account signs or not
    // to test missing signer vulnerability`;
  }

  return `#[flow]
fn ${fnName}_flow(&mut self) {
    // ── Flow: ${t.from} → ${t.to} via ${t.via} ──${preconditionCheck}${authSetup}

    let mut tx = ${txBuilderName}Transaction::build(
        &mut self.trident,
        &mut self.fuzz_accounts,
    );

    // Execute with randomized signer flags to test auth checks
    self.trident
        .execute_transaction(&mut tx, Some("${t.via}"));

    // Update tracked state
    self.current_state = "${t.to}".to_string();
}`;
}

/**
 * Generate an #[invariant] function for a concept constraint.
 */
function generateInvariantFunction(
  constraint: ConceptConstraint,
  structName: string,
): string {
  const fnName = toRustFnName(constraint.name ?? "unnamed");

  return `#[invariant]
fn ${fnName}_invariant(&self) {
    // ── Invariant: ${constraint.name} ──
    // ${constraint.description ?? constraint.expression}
    //
    // This invariant is checked after EVERY transaction.
    // If it fails, Trident reports a bug with the full transaction sequence.

    // TODO: implement invariant check
    // Expression: ${constraint.expression}
    //
    // Example:
    //   let account_data = self.fuzz_accounts
    //       .get::<${structName}Data>("${structName.toLowerCase()}")
    //       .unwrap();
    //   assert!(account_data.amount <= 1_000_000_000, "${constraint.name} violated");

    assert!(true, "TODO: implement ${constraint.name} invariant");
}`;
}

/**
 * Generate a transaction builder struct for a transition.
 */
function generateTransactionBuilder(t: StateTransition, structName: string): string {
  const txName = toRustStructName(t.via);
  const fnName = toRustFnName(t.via);

  return `/// Transaction builder for ${t.via} (${t.from} → ${t.to})
struct ${txName}Transaction;

impl ${txName}Transaction {
    /// Build a fuzzed ${t.via} transaction with randomized inputs.
    pub fn build(
        _trident: &mut Client,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Transaction {
        // ── Build instruction with fuzzed parameters ──
        //
        // TODO: implement instruction builder:
        // 1. Get or create accounts from fuzz_accounts
        // 2. Generate random instruction data
        // 3. Randomize signer flags (to test missing signer)
        // 4. Randomize account owner (to test missing owner check)
        //
        // Example:
        //   let authority = fuzz_accounts.get_or_create("authority");
        //   let config = fuzz_accounts.get_or_create("config");
        //
        //   let ix = Instruction {
        //       program_id: PROGRAM_ID,
        //       accounts: vec![
        //           AccountMeta::new(config.pubkey, false),
        //           AccountMeta::new(authority.pubkey, true), // randomize is_signer
        //       ],
        //       data: ${fnName}_data(random_amount(), random_seed()),
        //   };

        Transaction::default()
    }
}`;
}

/**
 * Generate Trident fuzz tests for all fuzzable concepts in the ontology.
 * A concept is "fuzzable" if it has a stateMachine with transitions.
 */
export function generateAllTridentFuzzTests(
  concepts: Concept[],
): { filename: string; content: string }[] {
  const fuzzable = findFuzzableConcepts(concepts);
  const results: { filename: string; content: string }[] = [];

  for (const concept of fuzzable) {
    const testName = toRustFnName(concept.canonicalName);
    results.push({
      filename: `${testName}_fuzz.rs`,
      content: generateTridentFuzzTest(concept),
    });
  }

  return results;
}

/**
 * Generate a Trident configuration file (Trident.toml) for a fuzz campaign.
 */
export function generateTridentConfig(concept: Concept): string {
  const testName = toRustFnName(concept.canonicalName);
  const transitions = concept.stateMachine?.transitions ?? [];

  return `# ── Trident Fuzz Configuration: ${concept.canonicalName} ──────────────────
# Auto-generated from ontology concept
# Reference: https://ackee.xyz/trident/docs/latest/

[fuzz]
# Target program to fuzz
program_name = "${testName}"
# Number of fuzz iterations
iterations = 100_000
# Transactions per flow
max_tx_per_flow = 10
# Seed for reproducibility (0 = random)
seed = 0
# Log level (error, warn, info, debug, trace)
log_level = "info"

[fuzz.flows]
# Flow weights — higher = more frequently executed
${transitions.map((t) => `${toRustFnName(t.via)}_flow = 1`).join("\n")}

[fuzz.accounts]
# Accounts to initialize before fuzzing
# TODO: add account definitions
`;
}
