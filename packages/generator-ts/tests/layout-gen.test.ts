import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { Concept } from "@solana-ontology/core";
import {
  generateAll,
  generateDecoder,
  generateEncoder,
  generateLayoutRuntime,
  hasAccountLayout,
} from "../src/index.js";

const layoutConcept: Concept = {
  canonicalName: "TokenVault",
  purpose: "Test vault account",
  category: "token",
  version: "1.0.0",
  properties: [],
  accountLayout: {
    // "vaultacct" would be 9 bytes; use an 8-byte hex discriminator
    discriminator: "6d756c7469736967",
    fields: [
      { name: "authority", type: "publicKey" },
      { name: "balance", type: "u64" },
      { name: "bump", type: "u8" },
      { name: "frozen", type: "bool" },
      { name: "delegate", type: "COption<publicKey>" },
      { name: "memo", type: "string" },
      { name: "tag", type: "Option<u64>" },
      { name: "extra", type: "bytes" },
    ],
  },
};

const noLayoutConcept: Concept = {
  canonicalName: "Bare",
  purpose: "No layout",
  category: "primitive",
  version: "1.0.0",
  properties: [{ name: "pubkey", type: "Address", required: true, description: "addr" }],
};

/** Transpile generated TS to ESM JS and import it for real execution. */
async function importGenerated(concepts: Concept[]): Promise<Record<string, any>> {
  const dir = mkdtempSync(join(tmpdir(), "gen-ts-"));
  const files = generateAll(concepts, { outputDir: dir, generateIndex: false });
  const outFiles: string[] = [];
  for (const file of files) {
    const js = ts.transpileModule(file.content, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const jsPath = file.path.replace(/\.ts$/, ".js");
    writeFileSync(jsPath, js);
    outFiles.push(jsPath);
  }
  const conceptFile = outFiles.find((f) => f.includes("tokenVault"));
  return import(pathToFileURL(conceptFile!).href);
}

describe("layout-gen", () => {
  it("detects concepts with and without accountLayout", () => {
    expect(hasAccountLayout(layoutConcept)).toBe(true);
    expect(hasAccountLayout(noLayoutConcept)).toBe(false);
  });

  it("generates a real decoder/encoder for layout concepts (no stubs)", () => {
    const decoder = generateDecoder(layoutConcept);
    const encoder = generateEncoder(layoutConcept);
    expect(decoder).not.toContain("not yet implemented");
    expect(encoder).not.toContain("not yet implemented");
    expect(decoder).toContain("checkDiscriminator");
    expect(decoder).toContain("r.pubkey()");
    expect(encoder).toContain("w.u64(value.balance)");
  });

  it("throws an explicit unsupported error for unknown layout field types", () => {
    const bad: Concept = {
      ...layoutConcept,
      accountLayout: { fields: [{ name: "x", type: "Vec<Whatever>" }] },
    };
    expect(() => generateDecoder(bad)).toThrow(/Unsupported accountLayout field type/);
  });

  it("keeps an explicit unsupported error (not TODO) for concepts without layout", () => {
    const decoder = generateDecoder(noLayoutConcept);
    expect(decoder).toContain("no accountLayout in the ontology");
    expect(decoder).not.toContain("TODO");
  });

  it("round-trips encode → decode through the actual generated code", async () => {
    const mod = await importGenerated([layoutConcept, noLayoutConcept]);

    const value = {
      authority: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      balance: 123456789012345678n,
      bump: 254,
      frozen: true,
      delegate: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      memo: "hello vault",
      tag: 42n,
      extra: new Uint8Array([9, 8, 7]),
    };

    const encoded: Uint8Array = mod.encodeTokenVault(value);
    // discriminator(8) + pubkey(32) + u64(8) + u8(1) + bool(1) + coption(4+32)
    // + string(4+11) + option(1+8) + bytes(4+3)
    expect(encoded.length).toBe(8 + 32 + 8 + 1 + 1 + 36 + 15 + 9 + 7);

    const decoded = mod.decodeTokenVault(encoded);
    expect(decoded).toEqual(value);

    // None variants round-trip too
    const noneValue = { ...value, delegate: null, tag: null };
    expect(mod.decodeTokenVault(mod.encodeTokenVault(noneValue))).toEqual(noneValue);
  });

  it("rejects data with a wrong discriminator or truncated body", async () => {
    const mod = await importGenerated([layoutConcept]);
    const good: Uint8Array = mod.encodeTokenVault({
      authority: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      balance: 1n,
      bump: 0,
      frozen: false,
      delegate: null,
      memo: "",
      tag: null,
      extra: new Uint8Array(0),
    });

    const badDisc = new Uint8Array(good);
    badDisc[0] ^= 0xff;
    expect(() => mod.decodeTokenVault(badDisc)).toThrow(/discriminator mismatch/);

    expect(() => mod.decodeTokenVault(good.subarray(0, good.length - 4))).toThrow(
      /Unexpected end of account data/,
    );
  });

  it("emits the shared runtime once when any concept has a layout", () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-ts-rt-"));
    const files = generateAll([layoutConcept], { outputDir: dir, generateIndex: false });
    const runtime = files.find((f) => f.path.endsWith("runtime.ts"));
    expect(runtime).toBeDefined();
    expect(runtime!.content).toBe(generateLayoutRuntime());

    const none = generateAll([noLayoutConcept], {
      outputDir: mkdtempSync(join(tmpdir(), "gen-ts-none-")),
      generateIndex: false,
    });
    expect(none.find((f) => f.path.endsWith("runtime.ts"))).toBeUndefined();
  });
});
