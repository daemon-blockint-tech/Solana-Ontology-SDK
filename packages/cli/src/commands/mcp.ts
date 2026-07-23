import { createServer } from "node:http";
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
    auth: { required: opts.authRequired },
  });

  server.registerConcepts(concepts);

  if (opts.transport === "http") {
    const httpServer = createServer(async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end("Method Not Allowed");
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const request = JSON.parse(body);
          const response = server.handleRequest(request);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch {
          res.writeHead(400).end("Invalid JSON");
        }
      });
    });

    httpServer.listen(opts.port, () => {
      console.error(`✓ MCP server (HTTP) running on http://localhost:${opts.port}/`);
      console.error("  Press Ctrl+C to stop");
    });

    process.on("SIGINT", () => {
      httpServer.close(() => {
        console.error("\n✓ MCP server stopped");
        process.exit(0);
      });
    });
  } else {
    console.error("✓ MCP server (stdio) ready — waiting for JSON-RPC on stdin");

    const chunks: string[] = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (data: string) => {
      chunks.push(data);
      try {
        const input = chunks.join("");
        const request = JSON.parse(input);
        chunks.length = 0;
        const response = server.handleRequest(request);
        process.stdout.write(JSON.stringify(response) + "\n");
      } catch {
        // Wait for more data (incomplete JSON)
      }
    });
  }
}
