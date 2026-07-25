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

  /**
   * Monotonic version that increments on every mutation (insert/update/delete/
   * clear). Optional: callers use it for cache invalidation and MUST treat its
   * absence as "always stale" (no caching). Backends that don't implement it
   * stay correct, just uncached.
   */
  version?(): number;

  /**
   * Run `fn` inside a single storage transaction when the backend supports it
   * (e.g. one SQLite commit instead of one per write). Optional: when absent the
   * caller runs `fn` directly. `fn` must be rolled back if it throws.
   */
  runInTransaction?<T>(fn: () => Promise<T>): Promise<T>;
}
