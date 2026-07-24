#!/usr/bin/env node
import { Command } from "commander";
import { resolveConfig } from "./config.js";
import { validateCommand } from "./commands/validate.js";
import { generateCommand } from "./commands/generate.js";
import { listCommand } from "./commands/list.js";
import { graphCommand } from "./commands/graph.js";
import { idlCommand } from "./commands/idl.js";
import { omsCommand } from "./commands/oms.js";
import { mcpCommand } from "./commands/mcp.js";
import { generateClientCommand } from "./commands/generate-client.js";

const program = new Command();

program
  .name("solana-ontology")
  .description("CLI for the Solana Ontology SDK — validate, generate, and explore concepts")
  .version("0.1.0");

program
  .command("validate")
  .description("Validate all concept YAML files against the ontology schema")
  .option("--path <path>", "Custom ontology root path")
  .action((opts) => {
    const config = resolveConfig(
      opts.path ? { ontologyRoot: opts.path, conceptsDir: `${opts.path}/concepts` } : {},
    );
    validateCommand(config);
  });

program
  .command("generate")
  .description("Generate typed SDK code from ontology concepts")
  .argument("<lang>", "Language to generate: ts or rust")
  .option("--out <path>", "Output directory")
  .option("--path <path>", "Custom ontology root path")
  .action((lang, opts) => {
    const config = resolveConfig(
      opts.path ? { ontologyRoot: opts.path, conceptsDir: `${opts.path}/concepts` } : {},
    );
    generateCommand(lang, config, opts.out);
  });

program
  .command("list")
  .description("List all concepts in the ontology")
  .option("--category <cat>", "Filter by category")
  .option("--path <path>", "Custom ontology root path")
  .action((opts) => {
    const config = resolveConfig(
      opts.path ? { ontologyRoot: opts.path, conceptsDir: `${opts.path}/concepts` } : {},
    );
    listCommand(config, opts.category);
  });

program
  .command("graph")
  .description("Output the concept relationship graph as a Mermaid diagram")
  .option("--path <path>", "Custom ontology root path")
  .action((opts) => {
    const config = resolveConfig(
      opts.path ? { ontologyRoot: opts.path, conceptsDir: `${opts.path}/concepts` } : {},
    );
    graphCommand(config);
  });

program
  .command("idl")
  .description("Parse an Anchor IDL JSON file and generate ontology concepts")
  .argument("<path>", "Path to the IDL JSON file")
  .option("--out <dir>", "Output directory for generated concept YAML")
  .option("--codemod-only", "Only transform v0→v1, output normalized IDL JSON")
  .option("--path <path>", "Custom ontology root path")
  .action((idlPath, opts) => {
    const config = resolveConfig(
      opts.path ? { ontologyRoot: opts.path, conceptsDir: `${opts.path}/concepts` } : {},
    );
    idlCommand(idlPath, config, opts.out, opts.codemodOnly);
  });

program
  .command("oms")
  .description("Start the Ontology Metadata Service REST API server")
  // No Commander default on --port: a default would mask the OMS_PORT env
  // fallback below (opts.port would never be undefined). Default is in the ??.
  .option("--port <port>", "Port to listen on (default 3000, or $OMS_PORT)")
  .option("--auth-token <token>", "Authentication token for write access")
  .option("--storage <type>", "Storage backend: memory or sqlite")
  .option("--db-path <path>", "SQLite database path (when --storage sqlite)")
  .option("--path <path>", "Custom ontology root path")
  .action(async (opts) => {
    const path = opts.path ?? process.env.ONTOLOGY_PATH;
    const config = resolveConfig(
      path ? { ontologyRoot: path, conceptsDir: `${path}/concepts` } : {},
    );
    // Env fallbacks let the Helm chart configure the container without CLI args.
    await omsCommand(config, {
      port: parseInt(opts.port ?? process.env.OMS_PORT ?? "3000", 10),
      authToken: opts.authToken ?? process.env.OMS_AUTH_TOKEN,
      storage: opts.storage ?? process.env.OMS_STORAGE,
      dbPath: opts.dbPath ?? process.env.OMS_DB_PATH,
    });
  });

program
  .command("mcp")
  .description("Start the MCP server for LLM agent interaction")
  // No Commander defaults on --transport/--port: they would mask the MCP_*
  // env fallbacks below. Defaults live in the ?? chains.
  .option("--transport <type>", "Transport: stdio or http (default stdio, or $MCP_TRANSPORT)")
  .option("--port <port>", "Port for HTTP transport (default 3001, or $MCP_PORT)")
  .option("--auth-required", "Require OAuth token for access")
  .option("--path <path>", "Custom ontology root path")
  .action(async (opts) => {
    const path = opts.path ?? process.env.ONTOLOGY_PATH;
    const config = resolveConfig(
      path ? { ontologyRoot: path, conceptsDir: `${path}/concepts` } : {},
    );
    // Env fallbacks let the Helm chart configure the container without CLI args.
    await mcpCommand(config, {
      transport: (opts.transport ?? process.env.MCP_TRANSPORT ?? "stdio") as "stdio" | "http",
      port: parseInt(opts.port ?? process.env.MCP_PORT ?? "3001", 10),
      authRequired: opts.authRequired || process.env.MCP_AUTH_REQUIRED === "true",
    });
  });

program
  .command("generate-client")
  .description("Generate a typed client library from ontology concepts")
  .option("--out <path>", "Output directory", "./generated/client")
  .option(
    "--package-name <name>",
    "NPM package name for generated client",
    "@my-org/ontology-client",
  )
  .option("--react", "Generate React hooks")
  .option("--no-queries", "Skip query builders")
  .option("--path <path>", "Custom ontology root path")
  .action((opts) => {
    const config = resolveConfig(
      opts.path ? { ontologyRoot: opts.path, conceptsDir: `${opts.path}/concepts` } : {},
    );
    generateClientCommand(config, {
      out: opts.out,
      packageName: opts.packageName,
      react: !!opts.react,
      queries: opts.queries !== false,
    });
  });

program.parse();
