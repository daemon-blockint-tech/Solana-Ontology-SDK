/**
 * Action Type Registry — converts StateMachine transitions to ActionTypeDefinitions.
 */

import type { Concept, StateTransition } from "@solana-ontology/core";
import type { ActionTypeDefinition, ActionParameter, SubmissionCriteria } from "./types.js";
import type { OmsStorage } from "./storage/interface.js";

/**
 * Convert a state transition to an action type definition.
 */
export function transitionToActionType(
  transition: StateTransition,
  concept: Concept,
): ActionTypeDefinition {
  // Generate parameters from concept properties
  const parameters: ActionParameter[] = (concept.properties ?? [])
    .filter((p) => p.required && p.name !== "pubkey")
    .map((p) => ({
      name: p.name,
      type: p.type,
      required: true,
      description: p.description,
    }));

  // Generate submission criteria from the transition
  const submissionCriteria: SubmissionCriteria = {
    requiredSigners: ["authority"],
    requiredWritable: [concept.canonicalName.toLowerCase() + "_account"],
    validationExpression: `state == "${transition.from}" → "${transition.to}"`,
  };

  return {
    name: `${concept.canonicalName}_${transition.via}`,
    objectType: concept.canonicalName,
    parameters,
    submissionCriteria,
    functionRef: `actions.${concept.canonicalName.toLowerCase()}.${transition.via.toLowerCase()}`,
    description: `${transition.via}: ${transition.from} → ${transition.to} for ${concept.canonicalName}`,
  };
}

export class ActionTypeRegistry {
  constructor(private storage: OmsStorage) {}

  async registerFromConcept(concept: Concept): Promise<ActionTypeDefinition[]> {
    const actions: ActionTypeDefinition[] = [];

    if (concept.stateMachine?.transitions) {
      for (const transition of concept.stateMachine.transitions) {
        const def = transitionToActionType(transition, concept);
        await this.storage.insertActionType(def);
        actions.push(def);
      }
    }

    return actions;
  }

  async registerMany(concepts: Concept[]): Promise<ActionTypeDefinition[]> {
    const results: ActionTypeDefinition[] = [];
    for (const concept of concepts) {
      results.push(...(await this.registerFromConcept(concept)));
    }
    return results;
  }

  async get(name: string): Promise<ActionTypeDefinition | null> {
    return this.storage.getActionType(name);
  }

  async list(): Promise<ActionTypeDefinition[]> {
    return this.storage.listActionTypes();
  }

  async delete(name: string): Promise<void> {
    await this.storage.deleteActionType(name);
  }
}
