/**
 * MCP Server core — JSON-RPC 2.0 over stdio and HTTP.
 * Exposes ontology concepts as MCP resources and actions as MCP tools.
 */

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
}
