import { describe, it, expect, beforeAll } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OntologyOmsServer } from "../src/index.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const conceptsDir = join(projectRoot, "ontology", "concepts");
const ontologyRoot = join(projectRoot, "ontology");

let concepts: ReturnType<typeof loadConcepts>;
beforeAll(() => {
  concepts = loadConcepts(conceptsDir, ontologyRoot);
});

describe("OMS instrumentation", () => {
  it("register metrics classify inserts vs idempotent replaces", async () => {
    const server = new OntologyOmsServer({ storage: "memory" });
    await server.registerConcepts(concepts); // all inserts
    const afterFirst = await server.stats();
    expect(afterFirst.register.runs).toBe(1);
    expect(afterFirst.register.inserted).toBeGreaterThan(0);
    expect(afterFirst.register.replaced).toBe(0);
    expect(afterFirst.transactions).toBe(1); // memory supports runInTransaction

    await server.registerConcepts(concepts); // same set → all idempotent replaces
    const afterSecond = await server.stats();
    expect(afterSecond.register.runs).toBe(2);
    expect(afterSecond.register.replaced).toBe(afterFirst.register.inserted);
    expect(afterSecond.version).toBeGreaterThan(afterFirst.version); // storage version advanced
  });

  it("serves /api/v1/stats and /metrics, and counts requests + cache hits", async () => {
    const server = new OntologyOmsServer({ port: 13470, storage: "memory" });
    await server.registerConcepts(concepts);
    await server.start();
    try {
      // Prime + hit the cache: two identical GETs.
      const r1 = await fetch("http://localhost:13470/api/v1/object-types");
      const body1 = await r1.text();
      const r2 = await fetch("http://localhost:13470/api/v1/object-types");
      const body2 = await r2.text();
      // Existing endpoint contract is unchanged (byte-identical, still {success,data}).
      expect(body2).toBe(body1);
      expect(JSON.parse(body1).success).toBe(true);

      const statsRes = await fetch("http://localhost:13470/api/v1/stats");
      const stats = (await statsRes.json()).data;
      expect(stats.version).toBe(server.getStorage().version!());
      expect(stats.counts.objectTypes).toBe(concepts.length);
      expect(stats.requests.total).toBeGreaterThanOrEqual(2);
      expect(stats.cache.hits).toBeGreaterThanOrEqual(1); // second GET was a hit
      expect(stats.storage).toBe("memory");

      const metricsRes = await fetch("http://localhost:13470/metrics");
      expect(metricsRes.headers.get("content-type")).toContain("text/plain");
      const prom = await metricsRes.text();
      expect(prom).toContain("# TYPE oms_requests_total counter");
      expect(prom).toContain("# TYPE oms_inflight_requests gauge");
      expect(prom).toContain("oms_cache_hits_total");
      expect(prom).toContain("# TYPE oms_request_duration_ms histogram");
    } finally {
      await server.stop();
    }
  });

  it("can disable /metrics via config", async () => {
    const server = new OntologyOmsServer({ port: 13471, storage: "memory", metrics: false });
    await server.start();
    try {
      const res = await fetch("http://localhost:13471/metrics");
      expect(res.status).toBe(404);
      // /api/v1/stats stays available regardless.
      const stats = await fetch("http://localhost:13471/api/v1/stats");
      expect(stats.status).toBe(200);
    } finally {
      await server.stop();
    }
  });
});
