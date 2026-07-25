import { describe, it, expect, beforeAll } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OntologyOmsServer, MemoryStorage } from "../src/index.js";
import type { ObjectTypeDefinition } from "../src/index.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const conceptsDir = join(projectRoot, "ontology", "concepts");
const ontologyRoot = join(projectRoot, "ontology");

let concepts: ReturnType<typeof loadConcepts>;
beforeAll(() => {
  concepts = loadConcepts(conceptsDir, ontologyRoot);
});

const sampleObjectType = (name: string): ObjectTypeDefinition => ({
  name,
  primaryKey: "pubkey",
  properties: [{ name: "pubkey", type: "String", required: true }],
});

describe("MemoryStorage.version", () => {
  it("increments on every mutation and is stable on reads", async () => {
    const s = new MemoryStorage();
    expect(s.version()).toBe(0);
    await s.insertObjectType(sampleObjectType("A"));
    const afterInsert = s.version();
    expect(afterInsert).toBe(1);
    await s.listObjectTypes(); // read must NOT bump
    expect(s.version()).toBe(afterInsert);
    await s.updateObjectType("A", { description: "x" });
    await s.deleteObjectType("A");
    await s.clear();
    expect(s.version()).toBe(4); // insert, update, delete, clear
  });
});

describe("OMS response cache + ETag", () => {
  it("serves identical body + ETag from cache, and invalidates on write", async () => {
    const server = new OntologyOmsServer({ port: 13460, storage: "memory" });
    // Register a subset first so we can observe invalidation after adding more.
    const first = concepts.slice(0, 5);
    await server.registerConcepts(first);
    await server.start();
    try {
      const r1 = await fetch("http://localhost:13460/api/v1/object-types");
      const etag1 = r1.headers.get("etag");
      const body1 = await r1.text();
      expect(etag1).toBeTruthy();

      // Second identical request — same version → identical body + ETag (cache hit).
      const r2 = await fetch("http://localhost:13460/api/v1/object-types");
      expect(r2.headers.get("etag")).toBe(etag1);
      expect(await r2.text()).toBe(body1);

      // If-None-Match with the current ETag → 304, no body.
      const r304 = await fetch("http://localhost:13460/api/v1/object-types", {
        headers: { "If-None-Match": etag1! },
      });
      expect(r304.status).toBe(304);
      expect(await r304.text()).toBe("");

      // A write bumps the version → new ETag + fresh (larger) payload.
      await server.registerConcepts(concepts);
      const r3 = await fetch("http://localhost:13460/api/v1/object-types");
      expect(r3.headers.get("etag")).not.toBe(etag1);
      const data3 = (await r3.json()).data as unknown[];
      expect(data3.length).toBeGreaterThan(5);
    } finally {
      await server.stop();
    }
  });

  it("caches the full /ontology dump and revalidates with 304", async () => {
    const server = new OntologyOmsServer({ port: 13461, storage: "memory" });
    await server.registerConcepts(concepts);
    await server.start();
    try {
      const r1 = await fetch("http://localhost:13461/api/v1/ontology");
      const etag = r1.headers.get("etag")!;
      const body = await r1.json();
      expect(body.data.conceptCount).toBe(concepts.length);

      const r2 = await fetch("http://localhost:13461/api/v1/ontology", {
        headers: { "If-None-Match": etag },
      });
      expect(r2.status).toBe(304);
    } finally {
      await server.stop();
    }
  });
});
