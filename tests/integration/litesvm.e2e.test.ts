/**
 * End-to-end against a REAL Solana runtime (LiteSVM, in-process).
 *
 * Everywhere else the generated decoders are exercised against hand-built
 * buffers or fake connections. Here the bundled TokenAccount concept's
 * generated encoder writes bytes into an actual Solana VM account store, and
 * its generated decoder reads them back out of the VM — proving the native
 * fixed-layout codec is correct against real runtime account storage, not just
 * byte arithmetic.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { LiteSVM } from "litesvm";
import { loadConcepts, type Concept } from "@solana-ontology/core";
import { generateAll } from "@solana-ontology/generator-ts";

const ONTOLOGY_ROOT = resolve(__dirname, "../../ontology");
const SDK_DIST = pathToFileURL(resolve(__dirname, "../../packages/sdk/dist/index.js")).href;
const SPL_TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// LiteSVM types brand addresses (Kit Address) and lamports; at runtime they are
// plain base58 strings / bigints, so we pass those and cast — avoiding a direct
// @solana/kit dependency (and its version pin) in this repo.
type AddressArg = Parameters<LiteSVM["airdrop"]>[0];
type AccountArg = Parameters<LiteSVM["setAccount"]>[0];
const address = (s: string): AddressArg => s as unknown as AddressArg;
const lamports = (n: bigint): bigint => n;
const encodedAccount = (a: {
  address: string;
  data: Uint8Array;
  executable: boolean;
  lamports: bigint;
  programAddress: string;
  space: bigint;
}): AccountArg => a as unknown as AccountArg;

/** Generate + transpile a concept's module and import it for real execution. */
async function importConceptModule(
  concept: Concept,
  basename: string,
): Promise<Record<string, any>> {
  const dir = mkdtempSync(join(tmpdir(), "e2e-"));
  const files = generateAll([concept], { outputDir: dir, generateIndex: false });
  let target: string | undefined;
  for (const file of files) {
    const source = file.content.replace(/"@solana-ontology\/sdk"/g, `"${SDK_DIST}"`);
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const jsPath = file.path.replace(/\.ts$/, ".js");
    writeFileSync(jsPath, js);
    if (jsPath.endsWith(`${basename}.js`)) target = jsPath;
  }
  return import(pathToFileURL(target!).href);
}

describe("LiteSVM e2e — generated codec against a real Solana VM", () => {
  let mod: Record<string, any>;

  beforeAll(async () => {
    const concept = loadConcepts(resolve(ONTOLOGY_ROOT, "concepts"), ONTOLOGY_ROOT).find(
      (c) => c.canonicalName === "TokenAccount",
    );
    expect(concept, "bundled TokenAccount concept").toBeDefined();
    mod = await importConceptModule(concept!, "tokenAccount");
  });

  it("boots a real VM that executes an airdrop", () => {
    const svm = new LiteSVM();
    const wallet = address("So11111111111111111111111111111111111111112");
    svm.airdrop(wallet, lamports(2_000_000_000n));
    expect(svm.getBalance(wallet)).toBe(2_000_000_000n);
  });

  it("round-trips a TokenAccount through the VM's real account store", () => {
    const svm = new LiteSVM();
    const acct = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

    // A realistic token account: a delegated balance (Some delegate) and a
    // native wrapper reserve (Some is_native), close_authority = None.
    const value = {
      mint: "So11111111111111111111111111111111111111112",
      owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      amount: 750_000_000n,
      delegate: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
      state: 1,
      isNative: 2_039_280n,
      delegatedAmount: 250_000_000n,
      closeAuthority: null,
    };

    const bytes: Uint8Array = mod.encodeTokenAccount(value);
    expect(bytes.length).toBe(165); // SPL Token account size

    // Store the bytes as a real account owned by the SPL Token program.
    svm.setAccount(
      encodedAccount({
        address: acct,
        data: bytes,
        executable: false,
        lamports: lamports(2_039_280n),
        programAddress: SPL_TOKEN,
        space: BigInt(bytes.length),
      }),
    );

    // Read them back out of the VM and decode with the generated decoder.
    const fetched = svm.getAccount(acct);
    expect(fetched?.exists).toBe(true);
    expect(fetched!.data.length).toBe(165);
    expect(fetched!.programAddress).toBe(address(SPL_TOKEN));

    const decoded = mod.decodeTokenAccount(new Uint8Array(fetched!.data));
    expect(decoded).toEqual(value);
  });

  it("decodes a None-delegate account stored in the VM without field shift", () => {
    const svm = new LiteSVM();
    const acct = address("Escrow1111111111111111111111111111111111111");
    const value = {
      mint: "So11111111111111111111111111111111111111112",
      owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      amount: 1n,
      delegate: null, // None — but its 36 reserved bytes must not shift `state`
      state: 1,
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
    };
    const bytes: Uint8Array = mod.encodeTokenAccount(value);
    svm.setAccount(
      encodedAccount({
        address: acct,
        data: bytes,
        executable: false,
        lamports: lamports(2_039_280n),
        programAddress: SPL_TOKEN,
        space: BigInt(bytes.length),
      }),
    );
    const decoded = mod.decodeTokenAccount(new Uint8Array(svm.getAccount(acct)!.data));
    expect(decoded.state).toBe(1);
    expect(decoded.delegate).toBeNull();
    expect(decoded).toEqual(value);
  });
});
