import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { Concept } from "@solana-ontology/core";
import { generateAll, generatePdaHelper, generateQuery, generateBatchQuery } from "../src/index.js";

const SDK_DIST = pathToFileURL(resolve(__dirname, "../../sdk/dist/index.js")).href;

const pdaLayoutConcept: Concept = {
  canonicalName: "Vault",
  purpose: "PDA vault with a layout",
  category: "defi",
  version: "1.0.0",
  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  relationships: [{ type: "derivedFrom", target: "PDA", cardinality: "0:1" }],
  pdaSeeds: [
    { name: "mint", type: "publicKey" },
    { name: "owner", type: "publicKey" },
  ],
  properties: [],
  accountLayout: {
    discriminator: "6d756c7469736967",
    fields: [
      { name: "owner", type: "publicKey" },
      { name: "amount", type: "u64" },
    ],
  },
};

const noLayoutConcept: Concept = {
  canonicalName: "Plain",
  purpose: "No layout, no PDA",
  category: "primitive",
  version: "1.0.0",
  properties: [{ name: "pubkey", type: "Address", required: true, description: "addr" }],
};

async function importGenerated(concept: Concept, base: string): Promise<Record<string, any>> {
  const dir = mkdtempSync(join(tmpdir(), "gen-pq-"));
  const files = generateAll([concept], { outputDir: dir, generateIndex: false });
  let target: string | undefined;
  for (const file of files) {
    const source = file.content.replace(/"@solana-ontology\/sdk"/g, `"${SDK_DIST}"`);
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const jsPath = file.path.replace(/\.ts$/, ".js");
    writeFileSync(jsPath, js);
    if (jsPath.includes(base)) target = jsPath;
  }
  return import(pathToFileURL(target!).href);
}

describe("pda-gen (real wiring)", () => {
  it("emits a real derivation helper, not a stub", () => {
    const code = generatePdaHelper(pdaLayoutConcept)!;
    expect(code).not.toContain("not yet implemented");
    expect(code).not.toContain("TODO");
    expect(code).toContain("return derivePda(programId, seeds)");
    expect(code).toContain("deriveVaultAddressFromSeeds");
  });

  it("derives a real PDA through the generated code", async () => {
    const mod = await importGenerated(pdaLayoutConcept, "vault");
    // Raw-seeds overload
    const a = await mod.deriveVaultAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", [
      new TextEncoder().encode("vault"),
    ]);
    expect(typeof a.address).toBe("string");
    expect(a.bump).toBeGreaterThanOrEqual(0);
    expect(a.bump).toBeLessThanOrEqual(255);

    // Typed named-seeds overload (uses concept default programId)
    const b = await mod.deriveVaultAddressFromSeeds({
      mint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      owner: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    });
    expect(typeof b.address).toBe("string");
    // Deterministic
    const b2 = await mod.deriveVaultAddressFromSeeds({
      mint: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      owner: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    });
    expect(b2.address).toBe(b.address);
  });
});

describe("query-gen (real wiring)", () => {
  it("emits a real fetch wired to the SDK when a layout exists", () => {
    const code = generateQuery(pdaLayoutConcept);
    expect(code).not.toContain("not yet implemented");
    expect(code).not.toContain("TODO");
    expect(code).toContain("return fetchAccount(connection, address, decodeVault,");
    expect(code).toContain("VaultAccountData | null");
  });

  it("fetches and decodes through the generated code against a fake connection", async () => {
    const mod = await importGenerated(pdaLayoutConcept, "vault");

    const value = {
      owner: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      amount: 999n,
    };
    const encoded: Uint8Array = mod.encodeVault(value);

    // web3.js Connection duck: returns account info keyed off getAccountInfo
    const connection = {
      getAccountInfo: async (_pk: { toBase58(): string }) => ({
        lamports: 1,
        data: Buffer.from(encoded),
        owner: { toBase58: () => "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        executable: false,
        rentEpoch: 0,
      }),
    };

    const decoded = await mod.fetchVault(
      connection,
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    );
    expect(decoded).toEqual(value);

    // Missing account → null
    const emptyConn = { getAccountInfo: async () => null };
    expect(
      await mod.fetchVault(emptyConn, "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    ).toBeNull();
  });

  it("throws an explicit unsupported error (not a stub) without a layout", () => {
    const q = generateQuery(noLayoutConcept);
    const bq = generateBatchQuery(noLayoutConcept);
    expect(q).toContain("no accountLayout in the ontology");
    expect(bq).toContain("no accountLayout in the ontology");
    expect(q).not.toContain("TODO");
    expect(q).not.toContain("not yet implemented");
  });
});
