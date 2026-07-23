/**
 * In-memory storage backend — default for dev/testing.
 */

import type { OmsStorage } from "./interface.js";
import type { ObjectTypeDefinition, LinkTypeDefinition, ActionTypeDefinition } from "../types.js";

export class MemoryStorage implements OmsStorage {
  private objectTypes = new Map<string, ObjectTypeDefinition>();
  private linkTypes = new Map<string, LinkTypeDefinition>();
  private actionTypes = new Map<string, ActionTypeDefinition>();

  async insertObjectType(type: ObjectTypeDefinition): Promise<void> {
    this.objectTypes.set(type.name, type);
  }

  async updateObjectType(name: string, updates: Partial<ObjectTypeDefinition>): Promise<void> {
    const existing = this.objectTypes.get(name);
    if (!existing) throw new Error(`Object type "${name}" not found`);
    this.objectTypes.set(name, { ...existing, ...updates });
  }

  async getObjectType(name: string): Promise<ObjectTypeDefinition | null> {
    return this.objectTypes.get(name) ?? null;
  }

  async listObjectTypes(): Promise<ObjectTypeDefinition[]> {
    return Array.from(this.objectTypes.values());
  }

  async deleteObjectType(name: string): Promise<void> {
    this.objectTypes.delete(name);
  }

  async insertLinkType(type: LinkTypeDefinition): Promise<void> {
    this.linkTypes.set(type.name, type);
  }

  async getLinkType(name: string): Promise<LinkTypeDefinition | null> {
    return this.linkTypes.get(name) ?? null;
  }

  async listLinkTypes(): Promise<LinkTypeDefinition[]> {
    return Array.from(this.linkTypes.values());
  }

  async deleteLinkType(name: string): Promise<void> {
    this.linkTypes.delete(name);
  }

  async insertActionType(type: ActionTypeDefinition): Promise<void> {
    this.actionTypes.set(type.name, type);
  }

  async getActionType(name: string): Promise<ActionTypeDefinition | null> {
    return this.actionTypes.get(name) ?? null;
  }

  async listActionTypes(): Promise<ActionTypeDefinition[]> {
    return Array.from(this.actionTypes.values());
  }

  async deleteActionType(name: string): Promise<void> {
    this.actionTypes.delete(name);
  }

  async clear(): Promise<void> {
    this.objectTypes.clear();
    this.linkTypes.clear();
    this.actionTypes.clear();
  }
}
