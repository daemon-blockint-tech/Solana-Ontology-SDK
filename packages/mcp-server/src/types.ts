// ── MCP Protocol Types ─────────────────────────────────────────────────────

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: { name: string; description: string; required: boolean }[];
}

// ── JSON-RPC 2.0 ───────────────────────────────────────────────────────────

export interface McpRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ── OAuth Config ───────────────────────────────────────────────────────────

export interface OAuthConfig {
  /** JWT verification public key or shared secret */
  jwtSecret?: string;
  /** OAuth client ID */
  clientId?: string;
  /** OAuth client secret */
  clientSecret?: string;
  /** Authorized scopes */
  scopes?: string[];
  /** Whether to require authentication */
  required: boolean;
}

// ── Server Config ──────────────────────────────────────────────────────────

export interface McpServerConfig {
  /** Transport mode: stdio for local, http for remote */
  transport: "stdio" | "http";
  /** HTTP port (only for http transport) */
  port?: number;
  /** OAuth configuration */
  auth?: OAuthConfig;
  /** OMS server URL (optional — for live data) */
  omsUrl?: string;
}
