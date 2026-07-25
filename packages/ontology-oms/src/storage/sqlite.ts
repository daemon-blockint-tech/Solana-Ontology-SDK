/**
 * SQLite storage backend for OMS.
 *
 * Uses Node's built-in `node:sqlite` module (stable enough for our synchronous,
 * in-process needs and available on Node >= 22.5) — no native dependency, no
 * build step. Loaded via `createRequire` so TypeScript does not try to resolve
 * `node:sqlite` against @types/node (which only ships those types on newer
 * releases) and so construction stays synchronous.
 *
 * Prepared statements are compiled once in the constructor and reused, so the
 * request/registration hot paths do not re-`prepare()` on every call.
 */

import { createRequire } from "node:module";
import type { OmsStorage } from "./interface.js";
import type { ObjectTypeDefinition, LinkTypeDefinition, ActionTypeDefinition } from "../types.js";

interface DbRow {
  name: string;
  data: string;
}

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): DbRow | undefined;
  all(...params: unknown[]): DbRow[];
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

/** Prepared statements for one `(name, data)` table. */
interface TableStatements {
  insert: SqliteStatement;
  selectOne: SqliteStatement;
  selectAll: SqliteStatement;
  update: SqliteStatement;
  delete: SqliteStatement;
}

export class SqliteStorage implements OmsStorage {
  private db: SqliteDatabase;
  private objectStmts: TableStatements;
  private linkStmts: TableStatements;
  private actionStmts: TableStatements;
  private _version = 0;

  constructor(dbPath: string) {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (path: string) => SqliteDatabase;
    };
    this.db = new DatabaseSync(dbPath);

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

    this.objectStmts = this.prepareTable("object_types");
    this.linkStmts = this.prepareTable("link_types");
    this.actionStmts = this.prepareTable("action_types");
  }

  private prepareTable(table: string): TableStatements {
    return {
      insert: this.db.prepare(`INSERT OR REPLACE INTO ${table} (name, data) VALUES (?, ?)`),
      selectOne: this.db.prepare(`SELECT data FROM ${table} WHERE name = ?`),
      selectAll: this.db.prepare(`SELECT data FROM ${table}`),
      update: this.db.prepare(`UPDATE ${table} SET data = ? WHERE name = ?`),
      delete: this.db.prepare(`DELETE FROM ${table} WHERE name = ?`),
    };
  }

  version(): number {
    return this._version;
  }

  async insertObjectType(type: ObjectTypeDefinition): Promise<void> {
    this.objectStmts.insert.run(type.name, JSON.stringify(type));
    this._version++;
  }

  async updateObjectType(name: string, updates: Partial<ObjectTypeDefinition>): Promise<void> {
    const row = this.objectStmts.selectOne.get(name);
    if (!row) throw new Error(`Object type "${name}" not found`);
    const existing = JSON.parse(row.data) as ObjectTypeDefinition;
    const updated = { ...existing, ...updates };
    this.objectStmts.update.run(JSON.stringify(updated), name);
    this._version++;
  }

  async getObjectType(name: string): Promise<ObjectTypeDefinition | null> {
    const row = this.objectStmts.selectOne.get(name);
    return row ? (JSON.parse(row.data) as ObjectTypeDefinition) : null;
  }

  async listObjectTypes(): Promise<ObjectTypeDefinition[]> {
    return this.objectStmts.selectAll.all().map((r) => JSON.parse(r.data) as ObjectTypeDefinition);
  }

  async deleteObjectType(name: string): Promise<void> {
    this.objectStmts.delete.run(name);
    this._version++;
  }

  async insertLinkType(type: LinkTypeDefinition): Promise<void> {
    this.linkStmts.insert.run(type.name, JSON.stringify(type));
    this._version++;
  }

  async getLinkType(name: string): Promise<LinkTypeDefinition | null> {
    const row = this.linkStmts.selectOne.get(name);
    return row ? (JSON.parse(row.data) as LinkTypeDefinition) : null;
  }

  async listLinkTypes(): Promise<LinkTypeDefinition[]> {
    return this.linkStmts.selectAll.all().map((r) => JSON.parse(r.data) as LinkTypeDefinition);
  }

  async deleteLinkType(name: string): Promise<void> {
    this.linkStmts.delete.run(name);
    this._version++;
  }

  async insertActionType(type: ActionTypeDefinition): Promise<void> {
    this.actionStmts.insert.run(type.name, JSON.stringify(type));
    this._version++;
  }

  async getActionType(name: string): Promise<ActionTypeDefinition | null> {
    const row = this.actionStmts.selectOne.get(name);
    return row ? (JSON.parse(row.data) as ActionTypeDefinition) : null;
  }

  async listActionTypes(): Promise<ActionTypeDefinition[]> {
    return this.actionStmts.selectAll.all().map((r) => JSON.parse(r.data) as ActionTypeDefinition);
  }

  async deleteActionType(name: string): Promise<void> {
    this.actionStmts.delete.run(name);
    this._version++;
  }

  async clear(): Promise<void> {
    this.db.exec("DELETE FROM object_types; DELETE FROM link_types; DELETE FROM action_types;");
    this._version++;
  }

  /**
   * Run `fn` inside a single SQLite transaction — one commit (one fsync) instead
   * of one per write. node:sqlite is synchronous and there is a single writer,
   * so the BEGIN/COMMIT brackets the writes done by `fn` deterministically.
   */
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec("BEGIN");
    try {
      const result = await fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  close(): void {
    this.db.close();
  }
}
