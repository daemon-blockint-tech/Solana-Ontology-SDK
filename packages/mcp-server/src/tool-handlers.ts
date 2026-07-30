/**
 * MCP tool handlers — expose ontology actions as MCP tools.
 * Human-in-the-loop gate: destructive actions require explicit approval token.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { Concept, StateTransition } from "@solana-ontology/core";
import type { McpTool, McpToolResult } from "./types.js";

/** Constant-time string comparison (hashes first to equalize lengths). */
function secureCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export class ToolHandlers {
  private concepts: Map<string, Concept> = new Map();
  /** Actions that require explicit human approval */
  private destructiveActions = new Set<string>();
  /** Operator-issued approval token; destructive actions are refused when unset */
  private approvalToken?: string;

  constructor(options?: { approvalToken?: string }) {
    this.approvalToken = options?.approvalToken;
  }

  registerConcepts(concepts: Concept[]): void {
    for (const concept of concepts) {
      this.concepts.set(concept.canonicalName, concept);

      // Mark destructive actions (close, delete, withdraw, burn)
      if (concept.stateMachine?.transitions) {
        for (const t of concept.stateMachine.transitions) {
          const name = `${concept.canonicalName}_${t.via}`;
          if (t.via.toLowerCase().match(/close|delete|withdraw|burn|revoke/)) {
            this.destructiveActions.add(name);
          }
        }
      }
    }
  }

  /**
   * List all available actions as MCP tools.
   */
  listTools(): McpTool[] {
    const tools: McpTool[] = [];

    for (const concept of this.concepts.values()) {
      if (!concept.stateMachine?.transitions) continue;

      for (const transition of concept.stateMachine.transitions) {
        const toolName = `${concept.canonicalName}_${transition.via}`;
        const isDestructive = this.destructiveActions.has(toolName);

        // Build input schema from concept properties
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const prop of concept.properties ?? []) {
          if (prop.required && prop.name !== "pubkey") {
            properties[prop.name] = {
              type: this.mapTypeToJsonSchema(prop.type),
              description: prop.description ?? prop.name,
            };
            required.push(prop.name);
          }
        }

        // Add approval token for destructive actions
        if (isDestructive) {
          properties._approvalToken = {
            type: "string",
            description:
              "Operator-issued approval token required for destructive actions. Obtain it out-of-band from the server operator.",
          };
          required.push("_approvalToken");
        }

        tools.push({
          name: toolName,
          description: `${transition.via}: ${transition.from} → ${transition.to} for ${concept.canonicalName}${isDestructive ? " [DESTRUCTIVE — requires approval]" : ""}`,
          inputSchema: {
            type: "object",
            properties,
            required: required.length > 0 ? required : undefined,
          },
        });
      }
    }

    return tools;
  }

  /**
   * Call a tool (execute an action).
   * For destructive actions, validates the approval token.
   * Returns a proposed transaction — does NOT execute on-chain.
   */
  callTool(name: string, params: Record<string, unknown>): McpToolResult {
    // Parse the tool name: <ConceptName>_<TransitionVia>
    const parts = name.split("_");
    if (parts.length < 2) {
      return {
        content: [{ type: "text", text: `ERROR: Invalid tool name format: ${name}` }],
        isError: true,
      };
    }

    const conceptName = parts[0];
    const transitionVia = parts.slice(1).join("_");

    const concept = this.concepts.get(conceptName);
    if (!concept) {
      return {
        content: [{ type: "text", text: `ERROR: Concept "${conceptName}" not found` }],
        isError: true,
      };
    }

    // Find the transition
    const transition = concept.stateMachine?.transitions.find(
      (t) => t.via.toLowerCase() === transitionVia.toLowerCase(),
    );
    if (!transition) {
      return {
        content: [
          {
            type: "text",
            text: `ERROR: Transition "${transitionVia}" not found for ${conceptName}`,
          },
        ],
        isError: true,
      };
    }

    // Gate destructive actions AFTER resolution, using the canonical resolved
    // name — gating on the raw input would let a case-altered tool name skip
    // the check while still resolving to the destructive transition.
    const canonicalToolName = `${concept.canonicalName}_${transition.via}`;
    if (this.destructiveActions.has(canonicalToolName)) {
      const provided = params._approvalToken;
      if (!this.approvalToken) {
        return {
          content: [
            {
              type: "text",
              text: `ERROR: Action "${canonicalToolName}" is destructive and this server has no approval token configured. The server operator must set one to enable destructive actions.`,
            },
          ],
          isError: true,
        };
      }
      if (typeof provided !== "string" || !secureCompare(provided, this.approvalToken)) {
        return {
          content: [
            {
              type: "text",
              text: `ERROR: Action "${canonicalToolName}" is destructive and requires human approval. Supply the operator-issued _approvalToken (obtained out-of-band) to proceed.`,
            },
          ],
          isError: true,
        };
      }
    }

    // Build proposed transaction (simulation only — no on-chain execution)
    const proposedTx = {
      concept: conceptName,
      action: transitionVia,
      stateTransition: `${transition.from} → ${transition.to}`,
      params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== "_approvalToken")),
      instructions: [
        {
          programId: "TBD",
          accounts: (concept.properties ?? [])
            .filter((p) => p.type === "Address")
            .map((p) => ({ name: p.name, pubkey: params[p.name] ?? "TBD" })),
          data: "TBD",
        },
      ],
      note: "This is a proposed transaction. Use the SDK to build, simulate, and dispatch.",
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(proposedTx, null, 2),
        },
      ],
    };
  }

  /**
   * Check if an action is destructive.
   */
  isDestructive(name: string): boolean {
    return this.destructiveActions.has(name);
  }

  private mapTypeToJsonSchema(type: string): string {
    if (type === "bool") return "boolean";
    if (type === "string" || type === "Address") return "string";
    if (type === "bytes") return "string";
    return "number"; // All numeric types → number in JSON Schema
  }
}
