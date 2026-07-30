import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { Concept } from "@solana-ontology/core";
import { generateActionTypes, generateQueries } from "../src/index.js";

const SDK_DIST = pathToFileURL(resolve(__dirname, "../../sdk/dist/index.js")).href;

const buildableConcept: Concept = {
  canonicalName: "Escrow",
  purpose: "Buildable escrow",
  category: "defi",
  version: "1.0.0",
  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  properties: [],
  stateMachine: {
    states: ["Uninitialized", "Active"],
    transitions: [{ from: "Uninitialized", to: "Active", via: "InitializeEscrow" }],
  },
  idlInstruction: {
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    instructionName: "initialize_escrow",
    discriminator: "0102030405060708",
    args: [{ name: "amount", type: "u64" }],
    accounts: [
      { name: "escrow", writable: true },
      { name: "authority", signer: true },
    ],
  },
};

const layoutConcept: Concept = {
  canonicalName: "Vault",
  purpose: "Vault with layout",
  category: "defi",
  version: "1.0.0",
  properties: [],
  accountLayout: {
    discriminator: "6d756c7469736967",
    fields: [{ name: "amount", type: "u64" }],
  },
};

const bareConcept: Concept = {
  canonicalName: "Bare",
  purpose: "No idl, no layout",
  category: "primitive",
  version: "1.0.0",
  properties: [],
  stateMachine: {
    states: ["A", "B"],
    transitions: [{ from: "A", to: "B", via: "Move" }],
  },
};

async function importModule(code: string, basename: string): Promise<Record<string, any>> {
  const dir = mkdtempSync(join(tmpdir(), "client-rt-"));
  const source = code.replace(/'@solana-ontology\/sdk'/g, `'${SDK_DIST}'`);
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const path = join(dir, `${basename}.js`);
  writeFileSync(path, js);
  return import(pathToFileURL(path).href);
}

describe("generated ActionTypes (real wiring)", () => {
  it("removes the stub and builds a real instruction", async () => {
    const code = generateActionTypes([buildableConcept]);
    expect(code).not.toContain("Not implemented");
    expect(code).not.toContain("TODO");
    expect(code).toContain("compileInstruction");

    const mod = await importModule(code, "ActionTypes");
    const ix = await mod.Escrow_InitializeEscrow(
      { amount: 42n },
      {
        escrow: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        authority: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      },
    );
    expect(ix.programId).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    expect(Array.from(ix.data.subarray(0, 8))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new DataView(ix.data.buffer, ix.data.byteOffset + 8).getBigUint64(0, true)).toBe(42n);
    expect(ix.accounts).toHaveLength(2);
  });

  it("throws an explicit (non-stub) error for transitions without IDL data", async () => {
    const code = generateActionTypes([bareConcept]);
    expect(code).not.toContain("Not implemented");
    const mod = await importModule(code, "ActionTypes");
    await expect(mod.Bare_Move()).rejects.toThrow(/no IDL instruction data/);
  });
});

describe("generated Queries (real wiring)", () => {
  it("removes the stub and runs a real getProgramAccounts query", async () => {
    const code = generateQueries([layoutConcept]);
    expect(code).not.toContain("TODO");
    expect(code).not.toContain("yield* []");
    expect(code).toContain("getProgramAccounts");
    expect(code).toContain("memcmp");

    const mod = await importModule(code, "Queries");

    const captured: any[] = [];
    const connection = {
      getProgramAccounts: async (_programId: unknown, config: any) => {
        captured.push(config);
        return [
          {
            pubkey: { toBase58: () => "PubkeyA1111111111111111111111111111111111" },
            account: { data: new Uint8Array([1]) },
          },
          {
            pubkey: { toBase58: () => "PubkeyB1111111111111111111111111111111111" },
            account: { data: new Uint8Array([2]) },
          },
        ];
      },
    };
    const decode = (data: Uint8Array) => ({ amount: BigInt(data[0]) });

    const out: any[] = [];
    for await (const acc of mod.iterateVault(
      connection,
      "Prog11111111111111111111111111111111111111",
      decode,
    )) {
      out.push(acc);
    }
    expect(out).toEqual([
      { pubkey: "PubkeyA1111111111111111111111111111111111", amount: 1n },
      { pubkey: "PubkeyB1111111111111111111111111111111111", amount: 2n },
    ]);
    // A real discriminator memcmp filter was passed
    expect(captured[0].filters[0].memcmp.offset).toBe(0);
    expect(typeof captured[0].filters[0].memcmp.bytes).toBe("string");

    // filter applies the predicate over the real query
    const filtered = await mod.filterVault(
      connection,
      "Prog11111111111111111111111111111111111111",
      decode,
      (a: any) => a.amount === 2n,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].amount).toBe(2n);
  });

  it("throws an explicit unsupported error for concepts without a discriminator", async () => {
    const code = generateQueries([bareConcept]);
    const mod = await importModule(code, "Queries");
    await expect(mod.iterateBare().next()).rejects.toThrow(/no accountLayout discriminator/);
    await expect(mod.filterBare()).rejects.toThrow(/no accountLayout discriminator/);
  });
});
