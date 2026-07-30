/**
 * Ontology Metadata Service (OMS) — independent REST API server.
 * Manages Object Types, Link Types, and Action Types.
 *
 * Uses Node's built-in http module — no external server dependency.
 * Any external system can integrate via standard REST calls.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Concept } from "@solana-ontology/core";
import { buildGraph, MetricsRegistry } from "@solana-ontology/core";
import type { OmsApiConfig, ApiResponse, OntologyDump, OmsStats } from "./types.js";
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
  /** Per-endpoint response cache keyed by storage version (see serveCached). */
  private cache = new Map<string, { body: string; etag: string; gen: number }>();
  /** Instrumentation — owned by this server instance (no global state). */
  private metrics = new MetricsRegistry();
  /** Live count of in-flight requests (contention signal). */
  private inflight = 0;
  private readonly startedAt = Date.now();

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
    // Live gauges (read at snapshot time from the real owning fields).
    this.metrics.registerGauge("oms_inflight_requests", () => this.inflight);
    this.metrics.registerGauge("oms_storage_version", () => this.storage.version?.() ?? -1);
    this.metrics.registerGauge("oms_cache_entries", () => this.cache.size);
  }

  static async create(config?: Partial<OmsApiConfig>): Promise<OntologyOmsServer> {
    const server = new OntologyOmsServer(config);
    if (server.config.storage === "sqlite") {
      const sqlite = new SqliteStorage(server.config.dbPath ?? "./ontology-oms.db");
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
    let objectTypes: Awaited<ReturnType<ObjectTypeRegistry["registerMany"]>> = [];
    let linkTypes: Awaited<ReturnType<LinkTypeRegistry["registerMany"]>> = [];
    let actionTypes: Awaited<ReturnType<ActionTypeRegistry["registerMany"]>> = [];

    const t0 = performance.now();
    // Counts before register let us classify each write as a real insert vs an
    // idempotent replace (registerMany is INSERT OR REPLACE, never deletes).
    const before = await this.typeCounts();

    // Register all three type sets in one storage transaction when supported, so
    // a bulk load is a single commit instead of ~3×N fsync'd INSERTs.
    const run = async () => {
      objectTypes = await this.objectRegistry.registerMany(concepts);
      linkTypes = await this.linkRegistry.registerMany(concepts);
      actionTypes = await this.actionRegistry.registerMany(concepts);
    };
    if (this.storage.runInTransaction) {
      await this.storage.runInTransaction(run);
      this.metrics.inc("oms_transactions_total");
    } else {
      await run();
    }

    const after = await this.typeCounts();
    this.recordRegister("object", objectTypes.length, after.objectTypes - before.objectTypes);
    this.recordRegister("link", linkTypes.length, after.linkTypes - before.linkTypes);
    this.recordRegister("action", actionTypes.length, after.actionTypes - before.actionTypes);
    this.metrics.inc("oms_registrations_total");
    this.metrics.observe("oms_register_duration_ms", performance.now() - t0);

    // Sync to external adapter (external I/O — kept outside the transaction)
    await this.adapter.syncObjectTypes(objectTypes);
    await this.adapter.syncLinkTypes(linkTypes);
    await this.adapter.syncActionTypes(actionTypes);
  }

  /** Emit inserted vs (idempotently) replaced counts for a type kind. */
  private recordRegister(kind: string, registered: number, inserted: number): void {
    const newlyInserted = Math.max(0, Math.min(registered, inserted));
    this.metrics.inc("oms_register_types_total", { kind, result: "inserted" }, newlyInserted);
    this.metrics.inc(
      "oms_register_types_total",
      { kind, result: "replaced" },
      registered - newlyInserted,
    );
  }

  private async typeCounts(): Promise<{
    objectTypes: number;
    linkTypes: number;
    actionTypes: number;
  }> {
    const [o, l, a] = await Promise.all([
      this.storage.listObjectTypes(),
      this.storage.listLinkTypes(),
      this.storage.listActionTypes(),
    ]);
    return { objectTypes: o.length, linkTypes: l.length, actionTypes: a.length };
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

    const url = req.url ?? "";
    const method = req.method ?? "GET";
    // Observability endpoints are read-only (no secrets) and must be reachable by
    // scrapers/health probes, so they bypass the write-auth token.
    const isObservability = method === "GET" && (url === "/metrics" || url === "/api/v1/stats");

    // Auth check
    if (this.config.authToken && !isObservability) {
      const auth = req.headers.authorization;
      // Constant-time comparison (hash both sides to equalize lengths)
      const expected = createHash("sha256").update(`Bearer ${this.config.authToken}`).digest();
      const provided = createHash("sha256")
        .update(auth ?? "")
        .digest();
      if (!auth || !timingSafeEqual(expected, provided)) {
        this.json(res, 401, { success: false, error: "Unauthorized" });
        return;
      }
    }

    const start = performance.now();
    this.inflight++;
    try {
      if (method === "GET") {
        // Prometheus scrape endpoint (live — not cached).
        if (url === "/metrics") {
          if (this.config.metrics === false) {
            this.json(res, 404, { success: false, error: "Metrics disabled" });
            return;
          }
          res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
          res.end(this.metrics.renderProm());
          return;
        }
        // State/versioning/idempotency/contention snapshot (live — not cached).
        if (url === "/api/v1/stats") {
          this.json(res, 200, { success: true, data: await this.buildStats() });
          return;
        }
        // Read endpoints are served through the version-keyed response cache.
        if (url === "/api/v1/ontology") {
          return await this.serveCached(req, res, "ontology", () => this.dump());
        }
        if (url === "/api/v1/object-types") {
          return await this.serveCached(req, res, "object-types", () =>
            this.storage.listObjectTypes(),
          );
        }
        if (url === "/api/v1/link-types") {
          return await this.serveCached(req, res, "link-types", () => this.storage.listLinkTypes());
        }
        if (url === "/api/v1/action-types") {
          return await this.serveCached(req, res, "action-types", () =>
            this.storage.listActionTypes(),
          );
        }
      }

      // 404
      this.json(res, 404, { success: false, error: "Not found" });
    } catch (err) {
      console.error("OMS request error:", err);
      this.json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      });
    } finally {
      this.inflight--;
      const endpoint = this.endpointLabel(url);
      this.metrics.inc("oms_requests_total", {
        endpoint,
        method,
        status: String(res.statusCode),
      });
      this.metrics.observe("oms_request_duration_ms", performance.now() - start, { endpoint });
    }
  }

  /** Low-cardinality endpoint label for request metrics. */
  private endpointLabel(url: string): string {
    const known = [
      "/api/v1/ontology",
      "/api/v1/object-types",
      "/api/v1/link-types",
      "/api/v1/action-types",
      "/api/v1/stats",
      "/metrics",
    ];
    return known.includes(url) ? url : "other";
  }

  /** Live state/versioning/idempotency/contention snapshot. */
  private async buildStats(): Promise<OmsStats> {
    const counts = await this.typeCounts();
    return {
      version: this.storage.version?.() ?? -1,
      storage: this.config.storage,
      uptimeMs: Date.now() - this.startedAt,
      counts,
      cache: {
        hits: this.metrics.getCounterTotal("oms_cache_hits_total"),
        misses: this.metrics.getCounterTotal("oms_cache_misses_total"),
        entries: this.cache.size,
      },
      requests: {
        total: this.metrics.getCounterTotal("oms_requests_total"),
        inflight: this.inflight,
      },
      register: {
        runs: this.metrics.getCounterTotal("oms_registrations_total"),
        inserted: this.metrics.getCounter("oms_register_types_total", {
          kind: "object",
          result: "inserted",
        }),
        replaced: this.metrics.getCounter("oms_register_types_total", {
          kind: "object",
          result: "replaced",
        }),
      },
      transactions: this.metrics.getCounterTotal("oms_transactions_total"),
    };
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  /**
   * Serve a read endpoint from a cache keyed by the storage version. The ontology
   * is static between writes, so on a cache hit we skip the storage read, per-row
   * JSON.parse, and response JSON.stringify entirely — just an integer compare and
   * a write of the cached string. Any storage mutation bumps `version()` and
   * invalidates every entry. If the backend has no `version()`, we never cache
   * (always rebuild) so correctness is preserved. Also honours `If-None-Match`.
   */
  private async serveCached(
    req: IncomingMessage,
    res: ServerResponse,
    key: string,
    build: () => Promise<unknown>,
  ): Promise<void> {
    const gen = this.storage.version?.() ?? -1;
    let entry = this.cache.get(key);
    const hit = entry !== undefined && entry.gen === gen && gen !== -1;
    this.metrics.inc(hit ? "oms_cache_hits_total" : "oms_cache_misses_total", { key });
    if (!entry || entry.gen !== gen) {
      const data = await build();
      entry = { body: JSON.stringify({ success: true, data }), etag: `"${key}-${gen}"`, gen };
      if (gen !== -1) this.cache.set(key, entry); // uncached when versioning is absent
    }

    if (gen !== -1 && req.headers["if-none-match"] === entry.etag) {
      res.writeHead(304, { ETag: entry.etag });
      res.end();
      return;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gen !== -1) headers["ETag"] = entry.etag;
    res.writeHead(200, headers);
    res.end(entry.body);
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
  /** The server's metrics registry (state/versioning/idempotency/contention). */
  getMetrics(): MetricsRegistry {
    return this.metrics;
  }
  /** Live state/versioning/idempotency/contention snapshot (same as GET /api/v1/stats). */
  stats(): Promise<OmsStats> {
    return this.buildStats();
  }
}
