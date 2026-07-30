import { loadConcepts, validateAll } from "@solana-ontology/core";
import { OntologyMcpServer } from "@solana-ontology/mcp-server";
import type { CliConfig } from "../config.js";

export async function mcpCommand(
  config: CliConfig,
  opts: {
    transport: "stdio" | "http";
    port: number;
    authRequired: boolean;
    authSecret?: string;
    approvalToken?: string;
  },
): Promise<void> {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  console.error(`Loaded ${concepts.length} concepts`);

  const result = validateAll(concepts);
  if (!result.valid) {
    console.error(`✗ Validation failed with ${result.errors.length} error(s)`);
    process.exit(1);
  }

  if (opts.authRequired && !opts.authSecret) {
    console.error(
      "✗ --auth-required is set but no secret was provided (use --auth-secret or $MCP_AUTH_SECRET)",
    );
    process.exit(1);
  }

  const server = new OntologyMcpServer({
    transport: opts.transport,
    port: opts.port,
    auth: { required: opts.authRequired, jwtSecret: opts.authSecret },
    approvalToken: opts.approvalToken,
  });

  server.registerConcepts(concepts);

  if (opts.transport === "http") {
    // startHttp() is the transport that enforces the auth config — never
    // bypass it with a bespoke http server.
    await server.startHttp();
    console.error(`✓ MCP server (HTTP) running on http://localhost:${opts.port}/`);
    console.error("  Press Ctrl+C to stop");

    process.on("SIGINT", () => {
      void server.stopHttp().then(() => {
        console.error("\n✓ MCP server stopped");
        process.exit(0);
      });
    });
  } else {
    console.error("✓ MCP server (stdio) ready — waiting for JSON-RPC on stdin");
    // Newline-delimited JSON-RPC framing, handled by the server itself
    server.startStdio();
  }
}
