/**
 * Link Type Registry — converts ConceptRelationships to LinkTypeDefinitions.
 */

import type { Concept, ConceptRelationship } from "@solana-ontology/core";
import type { LinkTypeDefinition } from "./types.js";
import type { OmsStorage } from "./storage/interface.js";

/**
 * Convert a ConceptRelationship to a LinkTypeDefinition.
 */
export function relationshipToLinkType(
  rel: ConceptRelationship,
  sourceConcept: Concept,
): LinkTypeDefinition {
  return {
    name: `${sourceConcept.canonicalName}_${rel.type}_${rel.target}`,
    sourceType: sourceConcept.canonicalName,
    targetType: rel.target,
    cardinality: rel.cardinality,
    bidirectional: rel.type === "contains" || rel.type === "extends",
    description: rel.description,
  };
}

/**
 * Build a lowercase-name → canonical-name index. First occurrence wins, matching
 * the first-match semantics of the original linear Set scan.
 */
function buildLowerToName(names: Iterable<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of names) {
    const lower = name.toLowerCase();
    if (!map.has(lower)) map.set(lower, name);
  }
  return map;
}

/**
 * Detect foreign-key links from Pubkey properties given a prebuilt
 * lowercase→name index (O(1) lookup per property).
 */
function buildAutoLinks(concept: Concept, lowerToName: Map<string, string>): LinkTypeDefinition[] {
  const links: LinkTypeDefinition[] = [];
  for (const prop of concept.properties ?? []) {
    if (prop.type === "Address" || prop.type === "PublicKey") {
      const propNameLower = prop.name.toLowerCase().replace(/_pubkey$|_key$|_address$/, "");
      const name = lowerToName.get(propNameLower);
      if (name !== undefined) {
        links.push({
          name: `${concept.canonicalName}_references_${name}`,
          sourceType: concept.canonicalName,
          targetType: name,
          cardinality: "many:1",
          bidirectional: false,
          sourceProperty: prop.name,
          description: `Auto-detected: ${concept.canonicalName}.${prop.name} references ${name}`,
        });
      }
    }
  }
  return links;
}

/**
 * Auto-detect foreign key links from Pubkey properties.
 * If a property type is "Address" and its name matches a concept name, create a link.
 */
export function autoDetectLinks(
  concept: Concept,
  allConceptNames: Set<string>,
): LinkTypeDefinition[] {
  return buildAutoLinks(concept, buildLowerToName(allConceptNames));
}

export class LinkTypeRegistry {
  constructor(private storage: OmsStorage) {}

  async registerFromConcept(
    concept: Concept,
    allConcepts: Concept[],
  ): Promise<LinkTypeDefinition[]> {
    const lowerToName = buildLowerToName(allConcepts.map((c) => c.canonicalName));
    return this.insertLinksFor(concept, lowerToName);
  }

  async registerMany(concepts: Concept[]): Promise<LinkTypeDefinition[]> {
    // Build the name index once (previously rebuilt per concept → O(n²)).
    const lowerToName = buildLowerToName(concepts.map((c) => c.canonicalName));
    const results: LinkTypeDefinition[] = [];
    for (const concept of concepts) {
      results.push(...(await this.insertLinksFor(concept, lowerToName)));
    }
    return results;
  }

  private async insertLinksFor(
    concept: Concept,
    lowerToName: Map<string, string>,
  ): Promise<LinkTypeDefinition[]> {
    const explicitLinks = (concept.relationships ?? []).map((rel) =>
      relationshipToLinkType(rel, concept),
    );
    const autoLinks = buildAutoLinks(concept, lowerToName);
    const allLinks = [...explicitLinks, ...autoLinks];
    for (const link of allLinks) {
      await this.storage.insertLinkType(link);
    }
    return allLinks;
  }

  async get(name: string): Promise<LinkTypeDefinition | null> {
    return this.storage.getLinkType(name);
  }

  async list(): Promise<LinkTypeDefinition[]> {
    return this.storage.listLinkTypes();
  }

  async delete(name: string): Promise<void> {
    await this.storage.deleteLinkType(name);
  }
}
