import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliConfig } from "../src/config.js";
import { validateCommand } from "../src/commands/validate.js";
import { listCommand } from "../src/commands/list.js";
import { graphCommand } from "../src/commands/graph.js";
import { generateCommand } from "../src/commands/generate.js";
import { idlCommand } from "../src/commands/idl.js";

const VALID_CONCEPT = `canonicalName: Widget
aliases: []
purpose: A test concept
category: primitive
version: "1.0.0"
owner: test
relationships:
  - type: ownedBy
    target: Program
    cardinality: "1:1"
`;

const PROGRAM_CONCEPT = `canonicalName: Program
purpose: An on-chain program concept
category: primitive
version: "1.0.0"
owner: test
`;

// Minimal Anchor IDL v0 fixture with a valid base58 program address.
const IDL_V0 = {
  version: "0.1.0",
  name: "widget_program",
  metadata: { address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
  instructions: [
    {
      name: "MintWidget",
      accounts: [{ name: "widget", isMut: true, isSigner: false }],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
  accounts: [
    {
      name: "WidgetAccount",
      type: { kind: "struct", fields: [{ name: "amount", type: "u64" }] },
    },
  ],
};

describe("cli commands", () => {
  let root: string;
  let config: CliConfig;
  let logs: string[];
  let errors: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cli-test-"));
    const conceptsDir = join(root, "concepts");
    mkdirSync(join(conceptsDir, "primitive"), { recursive: true });
    writeFileSync(join(conceptsDir, "primitive", "widget.yaml"), VALID_CONCEPT);
    writeFileSync(join(conceptsDir, "primitive", "program.yaml"), PROGRAM_CONCEPT);

    config = {
      ontologyRoot: root,
      conceptsDir,
      tsOutputDir: join(root, "gen-ts"),
      rustOutputDir: join(root, "gen-rust"),
    };

    logs = [];
    errors = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
    errSpy = vi.spyOn(console, "error").mockImplementation((...a) => void errors.push(a.join(" ")));
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it("validate: passes for a valid ontology", () => {
    validateCommand(config);
    expect(logs.join("\n")).toContain("concepts are valid");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("validate: exits non-zero on a dangling relationship target", () => {
    // Remove the Program concept so Widget's ownedBy → Program dangles.
    rmSync(join(config.conceptsDir, "primitive", "program.yaml"));
    expect(() => validateCommand(config)).toThrow("process.exit(1)");
    expect(errors.join("\n")).toContain("does not exist");
  });

  it("list: prints concepts and honors category filter", () => {
    listCommand(config);
    expect(logs.join("\n")).toContain("Widget");
    expect(logs.join("\n")).toContain("Program");

    logs.length = 0;
    listCommand(config, "token"); // no token concepts in fixture
    expect(logs.join("\n")).toContain("No concepts found.");
  });

  it("graph: emits a Mermaid graph with the ownedBy edge", () => {
    graphCommand(config);
    const out = logs.join("\n");
    expect(out).toContain("graph TD");
    expect(out).toContain("Widget -->|ownedBy| Program");
  });

  it("generate ts: writes TypeScript files", () => {
    generateCommand("ts", config);
    expect(existsSync(config.tsOutputDir)).toBe(true);
    expect(readdirSync(config.tsOutputDir).length).toBeGreaterThan(0);
    expect(logs.join("\n")).toContain("Generated");
  });

  it("generate: rejects an unknown language", () => {
    expect(() => generateCommand("cobol", config)).toThrow("process.exit(1)");
    expect(errors.join("\n")).toContain("Unknown language");
  });

  it("idl: codemod-only writes a normalized v1 JSON", () => {
    const idlPath = join(root, "idl.json");
    writeFileSync(idlPath, JSON.stringify(IDL_V0));
    const outPath = join(root, "idl.v1.json");
    idlCommand(idlPath, config, outPath, true);
    expect(existsSync(outPath)).toBe(true);
    expect(logs.join("\n")).toContain("Migrated to v1");
  });

  it("idl: full generation writes concept YAML files", () => {
    const idlPath = join(root, "idl.json");
    writeFileSync(idlPath, JSON.stringify(IDL_V0));
    const outDir = join(root, "generated-concepts");
    idlCommand(idlPath, config, outDir, false);
    expect(existsSync(outDir)).toBe(true);
    expect(readdirSync(outDir).some((f) => f.endsWith(".yaml"))).toBe(true);
  });
});
