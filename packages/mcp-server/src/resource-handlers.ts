/**
 * MCP resource handlers — expose ontology concepts as MCP resources.
 */

import type { Concept } from "@solana-ontology/core";
import type { McpResource, McpResourceContent } from "./types.js";

export class ResourceHandlers {
  private concepts: Map<string, Concept> = new Map();

  registerConcepts(concepts: Concept[]): void {
    for (const concept of concepts) {
      this.concepts.set(concept.canonicalName, concept);
    }
  }

  /**
   * List all concepts as MCP resources.
   */
  listResources(): McpResource[] {
    return Array.from(this.concepts.values()).map((concept) => ({
      uri: `solana-ontology://concept/${concept.canonicalName}`,
      name: concept.canonicalName,
      description: concept.purpose,
      mimeType: "application/json",
    }));
  }

  /**
   * Read a specific concept resource by URI.
   */
  readResource(uri: string): McpResourceContent | null {
    // Parse URI: solana-ontology://concept/<CanonicalName>
    const match = uri.match(/^solana-ontology:\/\/concept\/(.+)$/);
    if (!match) return null;

    const name = match[1];
    const concept = this.concepts.get(name);
    if (!concept) return null;

    // Strip internal fields
    const { _sourceFile, ...data } = concept;
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(data, null, 2),
    };
  }

  /**
   * Search resources by query string.
   */
  searchResources(query: string): McpResource[] {
    const lower = query.toLowerCase();
    return this.listResources().filter(
      (r) =>
        r.name.toLowerCase().includes(lower) ||
        r.description?.toLowerCase().includes(lower),
    );
  }

  /**
   * Get concepts by category.
   */
  getResourcesByCategory(category: string): McpResource[] {
    return Array.from(this.concepts.values())
      .filter((c) => c.category === category)
      .map((concept) => ({
        uri: `solana-ontology://concept/${concept.canonicalName}`,
        name: concept.canonicalName,
        description: concept.purpose,
        mimeType: "application/json",
      }));
  }
}
