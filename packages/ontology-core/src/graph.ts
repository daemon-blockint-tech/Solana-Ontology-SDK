import type { Concept, ConceptRelationship, OntologyGraph } from "./types.js";

/**
 * Build a relationship graph from a list of concepts.
 * Detects orphans (concepts no other concept references) and
 * computes connected components via undirected adjacency.
 */
export function buildGraph(concepts: Concept[]): OntologyGraph {
  const nodes = new Map<string, Concept>();
  const edges = new Map<string, ConceptRelationship[]>();
  const referencedBy = new Set<string>();

  for (const concept of concepts) {
    nodes.set(concept.canonicalName, concept);
    edges.set(concept.canonicalName, concept.relationships ?? []);
  }

  for (const concept of concepts) {
    if (!concept.relationships) continue;
    for (const rel of concept.relationships) {
      if (nodes.has(rel.target)) {
        referencedBy.add(rel.target);
      }
    }
  }

  const orphans = concepts.map((c) => c.canonicalName).filter((name) => !referencedBy.has(name));

  const components = computeComponents(nodes, edges);

  return { nodes, edges, orphans, components };
}

function computeComponents(
  nodes: Map<string, Concept>,
  edges: Map<string, ConceptRelationship[]>,
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  const undirected = new Map<string, Set<string>>();
  for (const [name, rels] of edges) {
    if (!undirected.has(name)) undirected.set(name, new Set());
    for (const rel of rels) {
      if (nodes.has(rel.target)) {
        undirected.get(name)!.add(rel.target);
        if (!undirected.has(rel.target)) undirected.set(rel.target, new Set());
        undirected.get(rel.target)!.add(name);
      }
    }
  }

  for (const name of nodes.keys()) {
    if (visited.has(name)) continue;
    const component: string[] = [];
    const queue = [name];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      const neighbors = undirected.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  return components;
}

/**
 * Find all concepts that the given concept depends on (transitive closure).
 */
export function getDependencies(graph: OntologyGraph, conceptName: string): string[] {
  const result = new Set<string>();
  const queue = [conceptName];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const rels = graph.edges.get(current);
    if (!rels) continue;
    for (const rel of rels) {
      if (rel.type === "dependsOn" || rel.type === "ownedBy" || rel.type === "derivedFrom") {
        if (!result.has(rel.target)) {
          result.add(rel.target);
          queue.push(rel.target);
        }
      }
    }
  }
  return Array.from(result);
}

/**
 * Find all concepts that depend on the given concept (reverse dependencies).
 */
export function getDependents(graph: OntologyGraph, conceptName: string): string[] {
  const result: string[] = [];
  for (const [name, rels] of graph.edges) {
    for (const rel of rels) {
      if (rel.target === conceptName) {
        if (rel.type === "contains" || rel.type === "ownedBy" || rel.type === "extends") {
          result.push(name);
        }
      }
    }
  }
  return result;
}
