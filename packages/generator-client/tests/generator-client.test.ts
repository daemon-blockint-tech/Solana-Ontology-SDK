import { describe, it, expect, beforeAll } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import { join } from "node:path";
import {
  generateObjectTypes,
  generateActionTypes,
  generateClient,
  generateQueries,
  generateClientFiles,
} from "../src/index.js";

const conceptsDir = join(process.cwd(), "ontology", "concepts");
const ontologyRoot = join(process.cwd(), "ontology");

let concepts: ReturnType<typeof loadConcepts>;

beforeAll(() => {
  concepts = loadConcepts(conceptsDir, ontologyRoot);
});

describe("generator-client", () => {
  it("should generate ObjectTypes.ts with interfaces", () => {
    const code = generateObjectTypes(concepts);
    expect(code).toContain("export interface TokenMint");
    expect(code).toContain("pubkey: string;");
    // Should map u64 to bigint
    expect(code).toContain("bigint");
  });

  it("should generate ActionTypes.ts with functions", () => {
    const code = generateActionTypes(concepts);
    expect(code).toContain("Auto-generated");
    // Should have functions for concepts with state machines
    const withSM = concepts.filter((c) => c.stateMachine?.transitions?.length);
    if (withSM.length > 0) {
      expect(code).toContain("export async function");
    }
  });

  it("should generate Client.ts with class", () => {
    const code = generateClient(concepts);
    expect(code).toContain("export class SolanaOntologyClient");
    expect(code).toContain("constructor");
    // Should have a method for each concept
    expect(code).toContain("TokenMint");
  });

  it("should generate Queries.ts with iterators", () => {
    const code = generateQueries(concepts);
    expect(code).toContain("async function*");
    expect(code).toContain("AsyncGenerator");
    expect(code).toContain("filter");
  });

  it("should generate all client files", () => {
    const files = generateClientFiles(concepts, {
      outputDir: "/tmp/test-client",
      packageName: "@test/client",
      generateReact: true,
      generateQueries: true,
    });

    expect(files.length).toBeGreaterThan(3);
    expect(files.some((f) => f.path === "ObjectTypes.ts")).toBe(true);
    expect(files.some((f) => f.path === "ActionTypes.ts")).toBe(true);
    expect(files.some((f) => f.path === "Client.ts")).toBe(true);
    expect(files.some((f) => f.path === "Queries.ts")).toBe(true);
    expect(files.some((f) => f.path === "Hooks.ts")).toBe(true);
    expect(files.some((f) => f.path === "index.ts")).toBe(true);
  });

  it("should skip queries and hooks when disabled", () => {
    const files = generateClientFiles(concepts, {
      outputDir: "/tmp/test-client",
      packageName: "@test/client",
      generateReact: false,
      generateQueries: false,
    });

    expect(files.some((f) => f.path === "Queries.ts")).toBe(false);
    expect(files.some((f) => f.path === "Hooks.ts")).toBe(false);
  });
});
