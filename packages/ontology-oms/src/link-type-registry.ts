/**
 * Link Type Registry — converts ConceptRelationships to LinkTypeDefinitions.
 */

import type { Concept, ConceptRelationship } from "@solana-ontology/core";
import type { LinkTypeDefinition } from "../types.js";
import type { OmsStorage } from "../storage/interface.js";

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
 * Auto-detect foreign key links from Pubkey properties.
 * If a property type is "Address" and its name matches a concept name, create a link.
 */
export function autoDetectLinks(
  concept: Concept,
  allConceptNames: Set<string>,
): LinkTypeDefinition[] {
  const links: LinkTypeDefinition[] = [];

  for (const prop of concept.properties ?? []) {
    if (prop.type === "Address" || prop.type === "PublicKey") {
      // Check if property name matches a concept name (case-insensitive)
      const propNameLower = prop.name.toLowerCase().replace(/_pubkey$|_key$|_address$/, "");
      for (const name of allConceptNames) {
        if (name.toLowerCase() === propNameLower) {
          links.push({
            name: `${concept.canonicalName}_references_${name}`,
            sourceType: concept.canonicalName,
            targetType: name,
            cardinality: "many:1",
            bidirectional: false,
            sourceProperty: prop.name,
            description: `Auto-detected: ${concept.canonicalName}.${prop.name} references ${name}`,
          });
          break;
        }
      }
    }
  }

  return links;
}

export class LinkTypeRegistry {
  constructor(private storage: OmsStorage) {}

  async registerFromConcept(
    concept: Concept,
    allConcepts: Concept[],
  ): Promise<LinkTypeDefinition[]> {
    const allNames = new Set(allConcepts.map((c) => c.canonicalName));
    const explicitLinks = (concept.relationships ?? []).map((rel) =>
      relationshipToLinkType(rel, concept),
    );
    const autoLinks = autoDetectLinks(concept, allNames);

    const allLinks = [...explicitLinks, ...autoLinks];
    for (const link of allLinks) {
      await this.storage.insertLinkType(link);
    }
    return allLinks;
  }

  async registerMany(concepts: Concept[]): Promise<LinkTypeDefinition[]> {
    const results: LinkTypeDefinition[] = [];
    for (const concept of concepts) {
      results.push(...(await this.registerFromConcept(concept, concepts)));
    }
    return results;
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
