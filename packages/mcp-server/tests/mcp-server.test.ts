import { describe, it, expect, beforeAll } from "vitest";
import { loadConcepts } from "@solana-ontology/core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OntologyMcpServer, OAuthProvider } from "../src/index.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const conceptsDir = join(projectRoot, "ontology", "concepts");
const ontologyRoot = join(projectRoot, "ontology");

let concepts: ReturnType<typeof loadConcepts>;

beforeAll(() => {
  concepts = loadConcepts(conceptsDir, ontologyRoot);
});

describe("mcp-server", () => {
  describe("OntologyMcpServer", () => {
    it("should register concepts and list resources", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const resources = server.listResources();
      expect(resources.length).toBe(concepts.length);
      expect(resources[0].uri).toMatch(/^solana-ontology:\/\/concept\//);
    });

    it("should read a resource by URI", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const tokenMint = concepts.find((c) => c.canonicalName === "TokenMint")!;
      const content = server.readResource(`solana-ontology://concept/${tokenMint.canonicalName}`);
      expect(content).not.toBeNull();
      expect(content!.mimeType).toBe("application/json");

      const parsed = JSON.parse(content!.text);
      expect(parsed.canonicalName).toBe("TokenMint");
    });

    it("should return null for unknown resource URI", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const content = server.readResource("solana-ontology://concept/NonExistent");
      expect(content).toBeNull();
    });

    it("should list tools from state machines", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const tools = server.listTools();
      // At least some concepts have state machines
      const withSM = concepts.filter((c) => c.stateMachine?.transitions?.length);
      if (withSM.length > 0) {
        expect(tools.length).toBeGreaterThan(0);
        expect(tools[0].inputSchema.type).toBe("object");
      }
    });

    it("should handle initialize request", () => {
      const server = new OntologyMcpServer();
      const response = server.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      });
      expect(response.result).toBeDefined();
      const result = response.result as { serverInfo: { name: string } };
      expect(result.serverInfo.name).toBe("solana-ontology-mcp");
    });

    it("should handle resources/list request", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const response = server.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/list",
      });
      const result = response.result as { resources: unknown[] };
      expect(result.resources.length).toBe(concepts.length);
    });

    it("should handle resources/read request", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const response = server.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "resources/read",
        params: { uri: "solana-ontology://concept/TokenMint" },
      });
      const result = response.result as { contents: { text: string }[] };
      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.canonicalName).toBe("TokenMint");
    });

    it("should handle tools/list request", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const response = server.handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      });
      const result = response.result as { tools: unknown[] };
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it("should return error for unknown method", () => {
      const server = new OntologyMcpServer();
      const response = server.handleRequest({
        jsonrpc: "2.0",
        id: 5,
        method: "unknown/method",
      });
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
    });

    it("should refuse destructive actions when no approval token is configured", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const tools = server.listTools();
      const destructive = tools.find((t) => t.description.includes("DESTRUCTIVE"));
      expect(destructive).toBeDefined();

      // Fail closed: without an operator-configured token, no value works
      const result = server.callTool(destructive!.name, { _approvalToken: "APPROVED" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("no approval token configured");
    });

    it("should gate destructive actions on the operator-configured approval token", () => {
      const server = new OntologyMcpServer({ approvalToken: "operator-secret" });
      server.registerConcepts(concepts);

      const tools = server.listTools();
      const destructive = tools.find((t) => t.description.includes("DESTRUCTIVE"));
      expect(destructive).toBeDefined();

      const blocked = server.callTool(destructive!.name, {});
      expect(blocked.isError).toBe(true);
      expect(blocked.content[0].text).toContain("requires human approval");
      // The error must not disclose the token itself
      expect(blocked.content[0].text).not.toContain("operator-secret");

      const wrongToken = server.callTool(destructive!.name, { _approvalToken: "APPROVED" });
      expect(wrongToken.isError).toBe(true);

      const approved = server.callTool(destructive!.name, { _approvalToken: "operator-secret" });
      expect(approved.isError).toBeUndefined();
    });

    it("fills proposals with real concept/IDL data instead of TBD placeholders", () => {
      const server = new OntologyMcpServer();
      server.registerConcepts(concepts);

      const tools = server.listTools();
      const nonDestructive = tools.find((t) => !t.description.includes("DESTRUCTIVE"));
      expect(nonDestructive).toBeDefined();

      const result = server.callTool(nonDestructive!.name, {});
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      expect(text).not.toContain('"TBD"');

      const proposal = JSON.parse(text);
      const ix = proposal.instructions[0];
      // Real fields present (null when the ontology lacks them, never "TBD")
      expect("programId" in ix).toBe(true);
      expect("discriminator" in ix).toBe(true);
      expect(Array.isArray(ix.accounts)).toBe(true);
      expect(proposal.note).toContain("not signed, not executed");

      // At least the concepts with a programId produce fully-addressed proposals
      const withProgram = concepts.find((c) => c.programId && c.stateMachine?.transitions?.length);
      if (withProgram) {
        const t = withProgram.stateMachine!.transitions[0];
        const r = server.callTool(`${withProgram.canonicalName}_${t.via}`, {});
        if (r.isError === undefined) {
          const p = JSON.parse(r.content[0].text);
          expect(p.instructions[0].programId).toBe(withProgram.programId);
        }
      }
    });

    it("should gate destructive actions even when the tool name is case-altered", () => {
      const server = new OntologyMcpServer({ approvalToken: "operator-secret" });
      server.registerConcepts(concepts);

      const tools = server.listTools();
      const destructive = tools.find((t) => t.description.includes("DESTRUCTIVE"));
      expect(destructive).toBeDefined();

      // Lowercase the transition segment — resolution is case-insensitive, so
      // the gate must still apply
      const [conceptPart, ...rest] = destructive!.name.split("_");
      const altered = `${conceptPart}_${rest.join("_").toLowerCase()}`;
      const result = server.callTool(altered, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires human approval");
    });
  });

  describe("OAuthProvider", () => {
    it("should allow access when auth not required", () => {
      const provider = new OAuthProvider({ required: false });
      const result = provider.validateToken("");
      expect(result.authorized).toBe(true);
    });

    it("should reject missing token when required", () => {
      const provider = new OAuthProvider({ required: true, jwtSecret: "secret" });
      const result = provider.validateToken("");
      expect(result.authorized).toBe(false);
    });

    it("should accept valid token", () => {
      const provider = new OAuthProvider({ required: true, jwtSecret: "my-secret" });
      const result = provider.validateToken("my-secret");
      expect(result.authorized).toBe(true);
    });

    it("should accept Bearer token format", () => {
      const provider = new OAuthProvider({ required: true, jwtSecret: "my-secret" });
      const result = provider.validateToken("Bearer my-secret");
      expect(result.authorized).toBe(true);
    });
  });
});
