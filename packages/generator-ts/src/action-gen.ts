import type { Concept, StateTransition } from "@solana-ontology/core";

/**
 * Generate an action builder function for a state machine transition.
 */
function generateTransitionAction(conceptName: string, transition: StateTransition): string {
  // Include the instruction (via) in the name — two transitions can share the
  // same from/to but go via different instructions, and duplicate function
  // names would make the generated module invalid
  const fnName = `build${transition.from}To${transition.to}Via${transition.via}${conceptName}Action`;

  return [
    `/**`,
    ` * Build an action for the ${conceptName} state transition:`,
    ` * ${transition.from} → ${transition.to}`,
    ` * Via: ${transition.via}`,
    ` */`,
    `export function ${fnName}(`,
    `  // TODO: Add typed parameters based on the transition requirements`,
    `): unknown {`,
    `  // TODO: Implement using @solana/kit instruction APIs or web3.js`,
    `  throw new Error(\`${fnName} not yet implemented — requires program IDL\`);`,
    `}`,
  ].join("\n");
}

/**
 * Generate all action builders for a concept's state machine.
 */
export function generateActions(concept: Concept): string[] {
  if (!concept.stateMachine?.transitions) return [];

  // Dedupe fully-identical transitions so the emitted module never contains
  // duplicate function declarations
  const seen = new Set<string>();
  const actions: string[] = [];
  for (const t of concept.stateMachine.transitions) {
    const key = `${t.from}→${t.to}→${t.via}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(generateTransitionAction(concept.canonicalName, t));
  }
  return actions;
}

/**
 * Generate a state enum for a concept's state machine.
 */
export function generateStateEnum(concept: Concept): string | null {
  if (!concept.stateMachine?.states) return null;

  const name = concept.canonicalName;
  const states = concept.stateMachine.states;

  const lines: string[] = [];
  lines.push(`export enum ${name}State {`);
  for (const state of states) {
    lines.push(`  ${state} = "${state}",`);
  }
  lines.push(`}`);
  return lines.join("\n");
}
