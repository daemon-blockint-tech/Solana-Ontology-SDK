/**
 * Object Type Registry — converts Concepts to ObjectTypeDefinitions.
 */

import type { Concept, ConceptProperty } from "@solana-ontology/core";
import type { ObjectTypeDefinition, ObjectTypeProperty, PropertyType } from "./types.js";
import type { OmsStorage } from "./storage/interface.js";

/**
 * Map a Solana/ontology type to OMS property type.
 */
export function mapSolanaTypeToOms(solanaType: string): PropertyType {
  const typeMap: Record<string, PropertyType> = {
    u8: "Long",
    u16: "Long",
    u32: "Long",
    u64: "Long",
    u128: "Long",
    i8: "Long",
    i16: "Long",
    i32: "Long",
    i64: "Long",
    i128: "Long",
    f32: "Double",
    f64: "Double",
    bool: "Boolean",
    Address: "String",
    string: "String",
    bytes: "Binary",
    PublicKey: "String",
    Signature: "String",
  };

  // Handle generic types
  if (solanaType.startsWith("Option<")) return mapSolanaTypeToOms(solanaType.slice(7, -1));
  if (solanaType.startsWith("Vec<")) return "Array";
  if (solanaType.startsWith("Array<")) return "Array";

  return typeMap[solanaType] ?? "String";
}

/**
 * Convert a Concept to an ObjectTypeDefinition.
 */
export function conceptToObjectType(concept: Concept): ObjectTypeDefinition {
  const properties: ObjectTypeProperty[] = (concept.properties ?? []).map(
    (prop: ConceptProperty) => ({
      name: prop.name,
      type: mapSolanaTypeToOms(prop.type),
      required: prop.required,
      description: prop.description,
    }),
  );

  // Add primary key if not already present (account pubkey)
  if (!properties.some((p) => p.name === "pubkey")) {
    properties.unshift({
      name: "pubkey",
      type: "String",
      required: true,
      description: "Solana account public key (primary key)",
    });
  }

  return {
    name: concept.canonicalName,
    primaryKey: "pubkey",
    properties,
    description: concept.purpose,
    sourceConcept: concept.canonicalName,
    indexes: [{ name: "by_owner", properties: ["owner"], unique: false }],
  };
}

export class ObjectTypeRegistry {
  constructor(private storage: OmsStorage) {}

  async registerFromConcept(concept: Concept): Promise<ObjectTypeDefinition> {
    const def = conceptToObjectType(concept);
    await this.storage.insertObjectType(def);
    return def;
  }

  async registerMany(concepts: Concept[]): Promise<ObjectTypeDefinition[]> {
    const results: ObjectTypeDefinition[] = [];
    for (const concept of concepts) {
      results.push(await this.registerFromConcept(concept));
    }
    return results;
  }

  async get(name: string): Promise<ObjectTypeDefinition | null> {
    return this.storage.getObjectType(name);
  }

  async list(): Promise<ObjectTypeDefinition[]> {
    return this.storage.listObjectTypes();
  }

  async update(name: string, updates: Partial<ObjectTypeDefinition>): Promise<void> {
    await this.storage.updateObjectType(name, updates);
  }

  async delete(name: string): Promise<void> {
    await this.storage.deleteObjectType(name);
  }
}
