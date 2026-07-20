import { loadConcepts, validateAll } from "@solana-ontology/core";
import { OntologyMcpServer } from "@solana-ontology/mcp-server";
import type { CliConfig } from "../config.js";

export async function mcpCommand(
  config: CliConfig,
  opts: { transport: "stdio" | "http"; port: number; authRequired: boolean },
): Promise<void> {
  const concepts = loadConcepts(config.conceptsDir, config.ontologyRoot);
  console.error(`Loaded ${concepts.length} concepts`);

  const result = validateAll(concepts);
  if (!result.valid) {
    console.error(`✗ Validation failed with ${result.errors.length} error(s)`);
    process.exit(1);
  }

  const server = new OntologyMcpServer({
    transport: opts.transport,
    port: opts.port,
    authRequired: opts.authRequired,
  });

  server.registerConcepts(concepts);

  if (opts.transport === "http") {
    await server.startHttp();
    console.error(`✓ MCP server (HTTP) running on http://localhost:${opts.port}/`);
    console.error("  Press Ctrl+C to stop");
    process.on("SIGINT", async () => {
      await server.stopHttp();
      console.error("\n✓ MCP server stopped");
      process.exit(0);
    });
  } else {
    console.error("✓ MCP server (stdio) ready — waiting for JSON-RPC on stdin");
    server.startStdio();
  }
}
