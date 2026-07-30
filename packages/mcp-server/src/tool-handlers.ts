/**
 * MCP tool handlers — expose ontology actions as MCP tools.
 * Human-in-the-loop gate: destructive actions require explicit approval token.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { Concept } from "@solana-ontology/core";
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

    // Build proposed transaction (proposal only — no signing, no on-chain
    // execution). Fields are filled from the concept's ontology/IDL data so
    // the proposal is directly buildable with the SDK.
    const idlRef = concept.idlInstruction;
    const programId = concept.programId ?? idlRef?.programId ?? null;
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([k]) => k !== "_approvalToken"),
    );

    // Accounts: prefer the IDL instruction's account list (with roles);
    // fall back to Address-typed concept properties
    const accounts =
      idlRef?.accounts && idlRef.accounts.length > 0
        ? idlRef.accounts.map((acc) => ({
            name: acc.name,
            pubkey: (params[acc.name] as string | undefined) ?? acc.address ?? null,
            writable: acc.writable === true,
            signer: acc.signer === true,
          }))
        : (concept.properties ?? [])
            .filter((p) => p.type === "Address")
            .map((p) => ({ name: p.name, pubkey: (params[p.name] as string | undefined) ?? null }));

    const proposedTx = {
      concept: conceptName,
      action: transitionVia,
      stateTransition: `${transition.from} → ${transition.to}`,
      params: cleanParams,
      instructions: [
        {
          programId,
          instructionName: idlRef?.instructionName ?? null,
          discriminator: idlRef?.discriminator ?? null,
          args: idlRef?.args ?? null,
          accounts,
        },
      ],
      note: programId
        ? "This is a proposed transaction (not signed, not executed). Build it with the SDK's compileInstruction, simulate, then dispatch."
        : "This is a proposed transaction (not signed, not executed). The concept declares no programId — regenerate concepts from the program IDL to fill instruction fields.",
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
