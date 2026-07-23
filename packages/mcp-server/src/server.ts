/**
 * MCP Server core — JSON-RPC 2.0 over stdio and HTTP.
 * Exposes ontology concepts as MCP resources and actions as MCP tools.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import * as readline from "node:readline";
import type { Concept } from "@solana-ontology/core";
import type {
  McpRequest,
  McpResponse,
  McpServerConfig,
  McpResource,
  McpTool,
  McpToolResult,
  McpResourceContent,
} from "./types.js";
import { ResourceHandlers } from "./resource-handlers.js";
import { ToolHandlers } from "./tool-handlers.js";
import { OAuthProvider } from "./auth.js";

export class OntologyMcpServer {
  private config: McpServerConfig;
  private resourceHandlers: ResourceHandlers;
  private toolHandlers: ToolHandlers;
  private authProvider: OAuthProvider;

  constructor(config?: Partial<McpServerConfig>) {
    this.config = {
      transport: "stdio",
      ...config,
    };
    this.resourceHandlers = new ResourceHandlers();
    this.toolHandlers = new ToolHandlers();
    this.authProvider = new OAuthProvider(this.config.auth ?? { required: false });
  }

  /**
   * Register ontology concepts with the MCP server.
   * This exposes each concept as an MCP resource and each state transition as an MCP tool.
   */
  registerConcepts(concepts: Concept[]): void {
    this.resourceHandlers.registerConcepts(concepts);
    this.toolHandlers.registerConcepts(concepts);
  }

  /**
   * Handle an MCP request (JSON-RPC 2.0).
   */
  handleRequest(request: McpRequest): McpResponse {
    try {
      switch (request.method) {
        case "initialize":
          return this.handleInitialize(request);

        case "resources/list":
          return this.handleListResources(request);

        case "resources/read":
          return this.handleReadResource(request);

        case "resources/search":
          return this.handleSearchResources(request);

        case "tools/list":
          return this.handleListTools(request);

        case "tools/call":
          return this.handleCallTool(request);

        case "prompts/list":
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: { prompts: [] },
          };

        default:
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          };
      }
    } catch (err) {
      console.error("MCP request error:", err);
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal error",
        },
      };
    }
  }

  // ── Direct API access (for programmatic use) ─────────────────────────────

  listResources(): McpResource[] {
    return this.resourceHandlers.listResources();
  }

  readResource(uri: string): McpResourceContent | null {
    return this.resourceHandlers.readResource(uri);
  }

  listTools(): McpTool[] {
    return this.toolHandlers.listTools();
  }

  callTool(name: string, params: Record<string, unknown>): McpToolResult {
    return this.toolHandlers.callTool(name, params);
  }

  // ── Method handlers ──────────────────────────────────────────────────────

  private handleInitialize(request: McpRequest): McpResponse {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          resources: { listChanged: false },
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: "solana-ontology-mcp",
          version: "0.1.0",
        },
      },
    };
  }

  private handleListResources(request: McpRequest): McpResponse {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { resources: this.resourceHandlers.listResources() },
    };
  }

  private handleReadResource(request: McpRequest): McpResponse {
    const uri = request.params?.uri as string;
    if (!uri) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: "Missing uri parameter" },
      };
    }
    const content = this.resourceHandlers.readResource(uri);
    if (!content) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: `Resource not found: ${uri}` },
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { contents: [content] },
    };
  }

  private handleSearchResources(request: McpRequest): McpResponse {
    const query = request.params?.query as string;
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { resources: this.resourceHandlers.searchResources(query ?? "") },
    };
  }

  private handleListTools(request: McpRequest): McpResponse {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { tools: this.toolHandlers.listTools() },
    };
  }

  private handleCallTool(request: McpRequest): McpResponse {
    const name = request.params?.name as string;
    const args = (request.params?.arguments ?? {}) as Record<string, unknown>;

    if (!name) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: "Missing tool name" },
      };
    }

    const result = this.toolHandlers.callTool(name, args);
    return {
      jsonrpc: "2.0",
      id: request.id,
      result,
    };
  }

  // ── Transport: stdio ─────────────────────────────────────────────────────

  private httpServer: Server | null = null;

  /**
   * Start stdio transport — read JSON-RPC from stdin, write responses to stdout.
   */
  startStdio(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const request = JSON.parse(trimmed) as McpRequest;
        const response = this.handleRequest(request);
        process.stdout.write(JSON.stringify(response) + "\n");
      } catch {
        const errorResponse: McpResponse = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error: invalid JSON" },
        };
        process.stdout.write(JSON.stringify(errorResponse) + "\n");
      }
    });

    rl.on("close", () => {
      process.exit(0);
    });
  }

  // ── Transport: HTTP ──────────────────────────────────────────────────────

  /**
   * Start HTTP transport — listen for JSON-RPC POST requests.
   */
  async startHttp(): Promise<void> {
    const port = this.config.port ?? 3001;

    this.httpServer = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        // CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            name: "solana-ontology-mcp",
            version: "0.1.0",
            transport: "http",
            resources: this.listResources().length,
            tools: this.listTools().length,
          }));
          return;
        }

        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        // Auth check
        if (this.config.auth?.required) {
          const authHeader = req.headers["authorization"];
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized: Bearer token required" }));
            return;
          }
          const token = authHeader.slice(7);
          const authResult = this.authProvider.validateToken(token);
          if (!authResult.authorized) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Forbidden: invalid token" }));
            return;
          }
        }

        // Read body
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
        }

        try {
          const request = JSON.parse(body) as McpRequest;
          const response = this.handleRequest(request);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch {
          const errorResponse: McpResponse = {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: invalid JSON" },
          };
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errorResponse));
        }
      },
    );

    return new Promise<void>((resolve) => {
      this.httpServer!.listen(port, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server.
   */
  async stopHttp(): Promise<void> {
    if (this.httpServer) {
      return new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          this.httpServer = null;
          resolve();
        });
      });
    }
  }
}
