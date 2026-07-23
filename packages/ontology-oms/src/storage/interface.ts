/**
 * Storage interface for OMS — pluggable backends.
 */

import type { ObjectTypeDefinition, LinkTypeDefinition, ActionTypeDefinition } from "../types.js";

export interface OmsStorage {
  // Object Types
  insertObjectType(type: ObjectTypeDefinition): Promise<void>;
  updateObjectType(name: string, type: Partial<ObjectTypeDefinition>): Promise<void>;
  getObjectType(name: string): Promise<ObjectTypeDefinition | null>;
  listObjectTypes(): Promise<ObjectTypeDefinition[]>;
  deleteObjectType(name: string): Promise<void>;

  // Link Types
  insertLinkType(type: LinkTypeDefinition): Promise<void>;
  getLinkType(name: string): Promise<LinkTypeDefinition | null>;
  listLinkTypes(): Promise<LinkTypeDefinition[]>;
  deleteLinkType(name: string): Promise<void>;

  // Action Types
  insertActionType(type: ActionTypeDefinition): Promise<void>;
  getActionType(name: string): Promise<ActionTypeDefinition | null>;
  listActionTypes(): Promise<ActionTypeDefinition[]>;
  deleteActionType(name: string): Promise<void>;

  // Bulk
  clear(): Promise<void>;
}
