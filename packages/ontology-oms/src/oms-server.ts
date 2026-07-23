/**
 * Ontology Metadata Service (OMS) — independent REST API server.
 * Manages Object Types, Link Types, and Action Types.
 *
 * Uses Node's built-in http module — no external server dependency.
 * Any external system can integrate via standard REST calls.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { Concept } from "@solana-ontology/core";
import { buildGraph } from "@solana-ontology/core";
import type { OmsApiConfig, ApiResponse, OntologyDump } from "./types.js";
import { MemoryStorage } from "./storage/memory.js";
import { SqliteStorage } from "./storage/sqlite.js";
import type { OmsStorage } from "./storage/interface.js";
import { ObjectTypeRegistry, conceptToObjectType } from "./object-type-registry.js";
import { LinkTypeRegistry } from "./link-type-registry.js";
import { ActionTypeRegistry } from "./action-type-registry.js";
import type { ExternalAdapter } from "./types.js";
import { NullAdapter } from "./adapter-plugin.js";

export class OntologyOmsServer {
  private server: Server | null = null;
  private storage: OmsStorage;
  private objectRegistry: ObjectTypeRegistry;
  private linkRegistry: LinkTypeRegistry;
  private actionRegistry: ActionTypeRegistry;
  private adapter: ExternalAdapter;
  private config: OmsApiConfig;

  /** Creates an OMS server with in-memory storage. Use OntologyOmsServer.create() for SQLite. */
  constructor(config?: Partial<OmsApiConfig>) {
    this.config = {
      port: 3000,
      storage: "memory",
      cors: true,
      ...config,
    };
    this.storage = new MemoryStorage();
    this.objectRegistry = new ObjectTypeRegistry(this.storage);
    this.linkRegistry = new LinkTypeRegistry(this.storage);
    this.actionRegistry = new ActionTypeRegistry(this.storage);
    this.adapter = new NullAdapter();
  }

  static async create(config?: Partial<OmsApiConfig>): Promise<OntologyOmsServer> {
    const server = new OntologyOmsServer(config);
    if (server.config.storage === "sqlite") {
      const sqlite = await SqliteStorage.create(server.config.dbPath ?? "./ontology-oms.db");
      server.setStorage(sqlite);
    }
    return server;
  }

  /**
   * Set the storage backend.
   */
  setStorage(storage: OmsStorage): void {
    this.storage = storage;
    this.objectRegistry = new ObjectTypeRegistry(storage);
    this.linkRegistry = new LinkTypeRegistry(storage);
    this.actionRegistry = new ActionTypeRegistry(storage);
  }

  /**
   * Set the external adapter for syncing to external systems.
   */
  setAdapter(adapter: ExternalAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Register concepts from the ontology into the OMS.
   * This auto-generates Object Types, Link Types, and Action Types.
   */
  async registerConcepts(concepts: Concept[]): Promise<void> {
    const objectTypes = await this.objectRegistry.registerMany(concepts);
    const linkTypes = await this.linkRegistry.registerMany(concepts);
    const actionTypes = await this.actionRegistry.registerMany(concepts);

    // Sync to external adapter
    await this.adapter.syncObjectTypes(objectTypes);
    await this.adapter.syncLinkTypes(linkTypes);
    await this.adapter.syncActionTypes(actionTypes);
  }

  /**
   * Get a full dump of the ontology.
   */
  async dump(): Promise<OntologyDump> {
    const [objectTypes, linkTypes, actionTypes] = await Promise.all([
      this.storage.listObjectTypes(),
      this.storage.listLinkTypes(),
      this.storage.listActionTypes(),
    ]);
    return {
      objectTypes,
      linkTypes,
      actionTypes,
      conceptCount: objectTypes.length,
    };
  }

  /**
   * Get the relationship graph as a Mermaid diagram.
   */
  getGraph(concepts: Concept[]): string {
    const graph = buildGraph(concepts);
    let mermaid = "graph TD\n";
    for (const [name, rels] of graph.edges) {
      for (const rel of rels) {
        if (graph.nodes.has(rel.target)) {
          mermaid += `  ${name} -->|${rel.type}| ${rel.target}\n`;
        }
      }
    }
    if (graph.orphans.length > 0) {
      mermaid += `  subgraph Orphans\n`;
      for (const orphan of graph.orphans) {
        mermaid += `    ${orphan}\n`;
      }
      mermaid += `  end\n`;
    }
    return mermaid;
  }

  /**
   * Start the HTTP server.
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer(async (req, res) => {
        this.handleRequest(req, res);
      });
      this.server.listen(this.config.port, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP requests.
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    if (this.config.cors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth check
    if (this.config.authToken) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${this.config.authToken}`) {
        this.json(res, 401, { success: false, error: "Unauthorized" });
        return;
      }
    }

    const url = req.url ?? "";
    const method = req.method ?? "GET";

    try {
      // GET /api/v1/ontology — full dump
      if (url === "/api/v1/ontology" && method === "GET") {
        const dump = await this.dump();
        this.json(res, 200, { success: true, data: dump });
        return;
      }

      // GET /api/v1/object-types
      if (url === "/api/v1/object-types" && method === "GET") {
        const types = await this.storage.listObjectTypes();
        this.json(res, 200, { success: true, data: types });
        return;
      }

      // GET /api/v1/link-types
      if (url === "/api/v1/link-types" && method === "GET") {
        const types = await this.storage.listLinkTypes();
        this.json(res, 200, { success: true, data: types });
        return;
      }

      // GET /api/v1/action-types
      if (url === "/api/v1/action-types" && method === "GET") {
        const types = await this.storage.listActionTypes();
        this.json(res, 200, { success: true, data: types });
        return;
      }

      // 404
      this.json(res, 404, { success: false, error: "Not found" });
    } catch (err) {
      console.error("OMS request error:", err);
      this.json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      });
    }
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  // ── Direct API access (for programmatic use without HTTP) ────────────────

  get objectTypes(): ObjectTypeRegistry {
    return this.objectRegistry;
  }
  get linkTypes(): LinkTypeRegistry {
    return this.linkRegistry;
  }
  get actionTypes(): ActionTypeRegistry {
    return this.actionRegistry;
  }
  getStorage(): OmsStorage {
    return this.storage;
  }
}
