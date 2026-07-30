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

async function importGenerated(concept: Concept): Promise<Record<string, any>> {
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
    if (jsPath.includes("escrow")) target = jsPath;
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
