/**
 * SQLite storage backend for OMS.
 * Uses better-sqlite3 for synchronous, fast, in-process SQLite.
 */

import type { OmsStorage } from "./interface.js";
import type {
  ObjectTypeDefinition,
  LinkTypeDefinition,
  ActionTypeDefinition,
} from "../types.js";

interface DbRow {
  name: string;
  data: string;
}

export class SqliteStorage implements OmsStorage {
  private db: {
    prepare: (sql: string) => {
      run: (params: unknown[]) => void;
      get: (params: unknown[]) => DbRow | undefined;
      all: () => DbRow[];
    };
    exec: (sql: string) => void;
    close: () => void;
  };

  constructor(dbPath: string) {
    // Dynamic import to avoid hard dependency in browser/edge environments
    // Use eval to bypass TypeScript module resolution for optional peer dep
    const Database = (eval("require") as (mod: string) => new (path: string) => typeof this.db)("better-sqlite3");
    this.db = new Database(dbPath);

    // Auto-create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS object_types (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS link_types (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS action_types (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
  }

  async insertObjectType(type: ObjectTypeDefinition): Promise<void> {
    this.db.prepare(
      "INSERT OR REPLACE INTO object_types (name, data) VALUES (?, ?)",
    ).run([type.name, JSON.stringify(type)]);
  }

  async updateObjectType(name: string, updates: Partial<ObjectTypeDefinition>): Promise<void> {
    const row = this.db.prepare("SELECT data FROM object_types WHERE name = ?").get([name]);
    if (!row) throw new Error(`Object type "${name}" not found`);
    const existing = JSON.parse(row.data) as ObjectTypeDefinition;
    const updated = { ...existing, ...updates };
    this.db.prepare(
      "UPDATE object_types SET data = ? WHERE name = ?",
    ).run([JSON.stringify(updated), name]);
  }

  async getObjectType(name: string): Promise<ObjectTypeDefinition | null> {
    const row = this.db.prepare("SELECT data FROM object_types WHERE name = ?").get([name]);
    return row ? (JSON.parse(row.data) as ObjectTypeDefinition) : null;
  }

  async listObjectTypes(): Promise<ObjectTypeDefinition[]> {
    const rows = this.db.prepare("SELECT data FROM object_types").all();
    return rows.map((r) => JSON.parse(r.data) as ObjectTypeDefinition);
  }

  async deleteObjectType(name: string): Promise<void> {
    this.db.prepare("DELETE FROM object_types WHERE name = ?").run([name]);
  }

  async insertLinkType(type: LinkTypeDefinition): Promise<void> {
    this.db.prepare(
      "INSERT OR REPLACE INTO link_types (name, data) VALUES (?, ?)",
    ).run([type.name, JSON.stringify(type)]);
  }

  async getLinkType(name: string): Promise<LinkTypeDefinition | null> {
    const row = this.db.prepare("SELECT data FROM link_types WHERE name = ?").get([name]);
    return row ? (JSON.parse(row.data) as LinkTypeDefinition) : null;
  }

  async listLinkTypes(): Promise<LinkTypeDefinition[]> {
    const rows = this.db.prepare("SELECT data FROM link_types").all();
    return rows.map((r) => JSON.parse(r.data) as LinkTypeDefinition);
  }

  async deleteLinkType(name: string): Promise<void> {
    this.db.prepare("DELETE FROM link_types WHERE name = ?").run([name]);
  }

  async insertActionType(type: ActionTypeDefinition): Promise<void> {
    this.db.prepare(
      "INSERT OR REPLACE INTO action_types (name, data) VALUES (?, ?)",
    ).run([type.name, JSON.stringify(type)]);
  }

  async getActionType(name: string): Promise<ActionTypeDefinition | null> {
    const row = this.db.prepare("SELECT data FROM action_types WHERE name = ?").get([name]);
    return row ? (JSON.parse(row.data) as ActionTypeDefinition) : null;
  }

  async listActionTypes(): Promise<ActionTypeDefinition[]> {
    const rows = this.db.prepare("SELECT data FROM action_types").all();
    return rows.map((r) => JSON.parse(r.data) as ActionTypeDefinition);
  }

  async deleteActionType(name: string): Promise<void> {
    this.db.prepare("DELETE FROM action_types WHERE name = ?").run([name]);
  }

  async clear(): Promise<void> {
    this.db.exec("DELETE FROM object_types; DELETE FROM link_types; DELETE FROM action_types;");
  }

  close(): void {
    this.db.close();
  }
}
