import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { Concept } from "@solana-ontology/core";
import { generateAll, generateInstructionBuilder, generateActions } from "../src/index.js";

const SDK_DIST = pathToFileURL(resolve(__dirname, "../../sdk/dist/index.js")).href;

const ixConcept: Concept = {
  canonicalName: "Escrow",
  purpose: "Test escrow account",
  category: "defi",
  version: "1.0.0",
  properties: [],
  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  stateMachine: {
    states: ["Uninitialized", "Active"],
    transitions: [
      { from: "Uninitialized", to: "Active", via: "InitializeEscrow" },
      { from: "Active", to: "Active", via: "TopUp" },
    ],
  },
  idlInstruction: {
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    instructionName: "initialize_escrow",
    discriminator: "0102030405060708",
    args: [
      { name: "amount", type: "u64" },
      { name: "memo", type: "option<string>" },
    ],
    accounts: [
      { name: "escrow", writable: true },
      { name: "authority", signer: true },
      { name: "systemProgram", address: "11111111111111111111111111111111" },
    ],
  },
};

async function importGenerated(
  concept: Concept,
  basename = "escrow",
): Promise<Record<string, any>> {
  const dir = mkdtempSync(join(tmpdir(), "gen-ix-"));
  const files = generateAll([concept], { outputDir: dir, generateIndex: false });
  let target: string | undefined;
  for (const file of files) {
    // Point the generated sdk import at the built sdk in this repo
    const source = file.content.replace('"@solana-ontology/sdk"', `"${SDK_DIST}"`);
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const jsPath = file.path.replace(/\.ts$/, ".js");
    writeFileSync(jsPath, js);
    if (jsPath.includes(basename)) target = jsPath;
  }
  return import(pathToFileURL(target!).href);
}

describe("generated instruction builders", () => {
  it("emits a typed builder for concepts with idlInstruction data", () => {
    const code = generateInstructionBuilder(ixConcept);
    expect(code).toBeTruthy();
    expect(code).toContain("export function buildInitializeEscrowEscrowInstruction");
    expect(code).toContain("InitializeEscrowEscrowParams");
    expect(code).toContain("compileInstruction");
    expect(code).not.toContain("TODO");
  });

  it("returns null for concepts without instruction data", () => {
    const bare: Concept = { ...ixConcept, idlInstruction: undefined };
    expect(generateInstructionBuilder(bare)).toBeNull();
  });

  it("builds a real instruction through the generated code", async () => {
    const mod = await importGenerated(ixConcept);

    const ix = mod.buildInitializeEscrowEscrowInstruction(
      { amount: 5000n, memo: "hi" },
      {
        escrow: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        authority: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      },
    );

    expect(ix.programId).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    // discriminator(8) + u64(8) + option tag(1) + string len(4) + "hi"(2)
    expect(ix.data.length).toBe(8 + 8 + 1 + 4 + 2);
    expect(Array.from(ix.data.subarray(0, 8))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new DataView(ix.data.buffer, ix.data.byteOffset + 8).getBigUint64(0, true)).toBe(5000n);

    expect(ix.accounts).toHaveLength(3);
    expect(ix.accounts[0]).toEqual({
      pubkey: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      isSigner: false,
      isWritable: true,
    });
    expect(ix.accounts[1].isSigner).toBe(true);
    // Fixed-address account resolved from the IDL default
    expect(ix.accounts[2].pubkey).toBe("11111111111111111111111111111111");
  });

  it("omitted option args encode as None", async () => {
    const mod = await importGenerated(ixConcept);
    const ix = mod.buildInitializeEscrowEscrowInstruction(
      { amount: 1n },
      {
        escrow: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        authority: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      },
    );
    expect(ix.data.length).toBe(8 + 8 + 1);
    expect(ix.data[16]).toBe(0);
  });

  it("wires the matching transition action to the real builder, others fail explicitly", async () => {
    const actions = generateActions(ixConcept);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toContain("buildInitializeEscrowEscrowInstruction(params, accounts)");
    expect(actions[1]).toContain("no IDL instruction data");
    expect(actions[1]).not.toContain("TODO");

    const mod = await importGenerated(ixConcept);
    const ix = mod.buildUninitializedToActiveViaInitializeEscrowEscrowAction(
      { amount: 2n, memo: null },
      {
        escrow: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        authority: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      },
    );
    expect(ix.programId).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    expect(() => mod.buildActiveToActiveViaTopUpEscrowAction()).toThrow(
      /no IDL instruction data for transition TopUp/,
    );
  });
});

describe("defined<T> struct args", () => {
  const structConcept: Concept = {
    canonicalName: "Vault",
    purpose: "Vault with struct-typed instruction arg",
    category: "defi",
    version: "1.0.0",
    properties: [],
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    idlInstruction: {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      instructionName: "configure",
      discriminator: "0807060504030201",
      args: [{ name: "config", type: "defined<VaultConfig>" }],
      accounts: [
        { name: "vault", writable: true },
        { name: "authority", signer: true },
      ],
      definedTypes: [
        {
          name: "VaultConfig",
          fields: [
            { name: "fee", type: "u16" },
            { name: "admin", type: "pubkey" },
            { name: "label", type: "option<string>" },
          ],
        },
      ],
    },
  };

  it("emits a typed struct interface and threads definedTypes to the compiler", () => {
    const code = generateInstructionBuilder(structConcept)!;
    expect(code).toContain("export interface VaultConfig {");
    expect(code).toContain("config: VaultConfig;");
    expect(code).toContain('definedTypes: [');
    // The struct arg is typed against the interface, not an unknown fallback
    expect(code).not.toContain("config: unknown");
  });

  it("encodes a struct arg through the generated builder for real", async () => {
    const mod = await importGenerated(structConcept, "vault");
    const ix = mod.buildConfigureVaultInstruction(
      {
        config: {
          fee: 250,
          admin: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
          label: null,
        },
      },
      {
        vault: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        authority: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      },
    );
    // discriminator(8) + u16 fee(2) + pubkey(32) + option tag None(1)
    expect(ix.data.length).toBe(8 + 2 + 32 + 1);
    expect(new DataView(ix.data.buffer, ix.data.byteOffset + 8).getUint16(0, true)).toBe(250);
    expect(ix.data[ix.data.length - 1]).toBe(0);
  });
});

describe("native 1-byte instruction tags", () => {
  const nativeTransfer: Concept = {
    canonicalName: "TokenAccount",
    purpose: "SPL token account",
    category: "token",
    version: "1.0.0",
    properties: [],
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    idlInstruction: {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      instructionName: "transfer",
      discriminator: "03", // native SPL Token tag — a single byte, not Anchor's 8
      args: [{ name: "amount", type: "u64" }],
      accounts: [
        { name: "source", writable: true },
        { name: "destination", writable: true },
        { name: "authority", signer: true },
      ],
    },
  };

  it("builds a real SPL Token Transfer with a single-byte tag", async () => {
    const mod = await importGenerated(nativeTransfer, "tokenAccount");
    const ix = mod.buildTransferTokenAccountInstruction(
      { amount: 42n },
      {
        source: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        destination: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        authority: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
      },
    );
    // tag(1) + u64 amount(8) — exactly the native wire format
    expect(ix.data.length).toBe(9);
    expect(ix.data[0]).toBe(3);
    expect(new DataView(ix.data.buffer, ix.data.byteOffset + 1).getBigUint64(0, true)).toBe(42n);
    expect(ix.accounts.map((a: { isSigner: boolean }) => a.isSigner)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe("action builder identifier sanitization", () => {
  it("produces a valid identifier when the transition via is free-form prose", () => {
    const prose: Concept = {
      canonicalName: "Widget",
      purpose: "x",
      category: "primitive",
      version: "1.0.0",
      properties: [],
      stateMachine: {
        states: ["Uninitialized", "Active"],
        transitions: [
          { from: "Uninitialized", to: "Active", via: "Initialize account or create the ATA!" },
        ],
      },
    };
    const [code] = generateActions(prose);
    // No spaces/punctuation may leak into the emitted function name
    const m = code.match(/export function (\w+)\(/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("buildUninitializedToActiveViaInitializeAccountOrCreateTheATAWidgetAction");
    // And the whole thing transpiles without a syntax error
    expect(() =>
      ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
      }),
    ).not.toThrow();
    // The prose is preserved verbatim inside the (safely escaped) error string
    expect(code).toContain("Initialize account or create the ATA!");
  });
});
