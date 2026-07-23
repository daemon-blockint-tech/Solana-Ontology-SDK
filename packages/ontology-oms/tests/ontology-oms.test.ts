import { describe, it, expect, beforeAll } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  OntologyOmsServer,
  conceptToObjectType,
  mapSolanaTypeToOms,
  MemoryStorage,
  NullAdapter,
  type ObjectTypeDefinition,
  type LinkTypeDefinition,
  type ActionTypeDefinition,
} from "../src/index.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const conceptsDir = join(projectRoot, "ontology", "concepts");
const ontologyRoot = join(projectRoot, "ontology");

let concepts: ReturnType<typeof loadConcepts>;

beforeAll(() => {
  concepts = loadConcepts(conceptsDir, ontologyRoot);
});

describe("ontology-oms", () => {
  describe("object-type-registry", () => {
    it("should map Solana types to OMS types", () => {
      expect(mapSolanaTypeToOms("u64")).toBe("Long");
      expect(mapSolanaTypeToOms("bool")).toBe("Boolean");
      expect(mapSolanaTypeToOms("Address")).toBe("String");
      expect(mapSolanaTypeToOms("bytes")).toBe("Binary");
      expect(mapSolanaTypeToOms("f64")).toBe("Double");
      expect(mapSolanaTypeToOms("Vec<u8>")).toBe("Array");
      expect(mapSolanaTypeToOms("Option<bool>")).toBe("Boolean");
    });

    it("should convert a concept to an object type", () => {
      const tokenMint = concepts.find((c) => c.canonicalName === "TokenMint");
      expect(tokenMint).toBeDefined();

      const objType = conceptToObjectType(tokenMint!);
      expect(objType.name).toBe("TokenMint");
      expect(objType.primaryKey).toBe("pubkey");
      expect(objType.properties.length).toBeGreaterThan(0);
      expect(objType.properties.some((p) => p.name === "pubkey")).toBe(true);
    });

    it("should register concepts and list object types", async () => {
      const storage = new MemoryStorage();
      const server = new OntologyOmsServer({ storage: "memory" });
      server.setStorage(storage);

      const tokenMint = concepts.find((c) => c.canonicalName === "TokenMint")!;
      await server.objectTypes.registerFromConcept(tokenMint);

      const types = await server.objectTypes.list();
      expect(types).toHaveLength(1);
      expect(types[0].name).toBe("TokenMint");
    });
  });

  describe("link-type-registry", () => {
    it("should register links from concept relationships", async () => {
      const storage = new MemoryStorage();
      const server = new OntologyOmsServer({ storage: "memory" });
      server.setStorage(storage);

      // Register a few concepts that have relationships
      const tokenAccount = concepts.find((c) => c.canonicalName === "TokenAccount")!;
      const tokenMint = concepts.find((c) => c.canonicalName === "TokenMint")!;
      await server.linkTypes.registerFromConcept(tokenAccount, [tokenAccount, tokenMint]);

      const links = await server.linkTypes.list();
      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe("action-type-registry", () => {
    it("should register actions from state machines", async () => {
      const storage = new MemoryStorage();
      const server = new OntologyOmsServer({ storage: "memory" });
      server.setStorage(storage);

      // Find a concept with a state machine
      const withSM = concepts.find((c) => c.stateMachine?.transitions?.length);
      if (withSM) {
        await server.actionTypes.registerFromConcept(withSM);
        const actions = await server.actionTypes.list();
        expect(actions.length).toBeGreaterThan(0);
        expect(actions[0].objectType).toBe(withSM.canonicalName);
      }
    });
  });

  describe("OntologyOmsServer", () => {
    it("should register all concepts and dump ontology", async () => {
      const server = new OntologyOmsServer({ storage: "memory" });
      await server.registerConcepts(concepts);

      const dump = await server.dump();
      expect(dump.conceptCount).toBe(concepts.length);
      expect(dump.objectTypes.length).toBe(concepts.length);
    });

    it("should generate a Mermaid graph", () => {
      const server = new OntologyOmsServer({ storage: "memory" });
      const graph = server.getGraph(concepts);
      expect(graph).toContain("graph TD");
      expect(graph).toContain("-->");
    });

    it("should start and stop the HTTP server", async () => {
      const server = new OntologyOmsServer({ port: 13456, storage: "memory" });
      await server.registerConcepts(concepts);
      await server.start();

      // Test the API
      const response = await fetch("http://localhost:13456/api/v1/ontology");
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.conceptCount).toBe(concepts.length);

      // Test object-types endpoint
      const typesResponse = await fetch("http://localhost:13456/api/v1/object-types");
      const typesBody = await typesResponse.json();
      expect(typesBody.success).toBe(true);
      expect(typesBody.data.length).toBe(concepts.length);

      await server.stop();
    });

    it("should return 404 for unknown routes", async () => {
      const server = new OntologyOmsServer({ port: 13457, storage: "memory" });
      await server.start();

      const response = await fetch("http://localhost:13457/api/v1/unknown");
      const body = await response.json();
      expect(response.status).toBe(404);
      expect(body.success).toBe(false);

      await server.stop();
    });
  });

  describe("NullAdapter", () => {
    it("should be a no-op", async () => {
      const adapter = new NullAdapter();
      await adapter.syncObjectTypes([]);
      await adapter.syncLinkTypes([]);
      await adapter.syncActionTypes([]);
    });
  });
});
