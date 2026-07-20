#!/usr/bin/env node
import { Command } from "commander";
import { resolveConfig } from "./config.js";
import { validateCommand } from "./commands/validate.js";
import { generateCommand } from "./commands/generate.js";
import { listCommand } from "./commands/list.js";
import { graphCommand } from "./commands/graph.js";

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

program.parse();
