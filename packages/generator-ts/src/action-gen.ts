import type { Concept, StateTransition } from "@solana-ontology/core";

/**
 * Generate an action builder function for a state machine transition.
 */
function generateTransitionAction(
  conceptName: string,
  transition: StateTransition,
): string {
  const fnName = `build${transition.from}To${transition.to}${conceptName}Action`;

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

  return concept.stateMachine.transitions.map((t) =>
    generateTransitionAction(concept.canonicalName, t),
  );
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
