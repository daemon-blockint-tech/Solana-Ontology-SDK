import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConcepts } from "@solana-ontology/core";
import type { Concept } from "@solana-ontology/core";
import { generateConceptRustFile } from "../src/emitter.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const conceptsDir = join(projectRoot, "ontology", "concepts");
const ontologyRoot = join(projectRoot, "ontology");

let concepts: Concept[];
beforeAll(() => {
  concepts = loadConcepts(conceptsDir, ontologyRoot);
});

/** rustc is optional: the suite must stay green on machines/CI without Rust. */
function hasRustc(): boolean {
  const probe = spawnSync("rustc", ["--version"], { encoding: "utf-8" });
  return probe.status === 0;
}

/**
 * Minimal stand-ins for the external crates the generated code imports, so the
 * compile check is hermetic (no crates.io, no network). `Pubkey` mirrors the real
 * type's shape: a 32-byte value that borrows as bytes.
 */
const PRELUDE = `
#![allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Pubkey(pub [u8; 32]);
impl Pubkey {
    pub fn find_program_address(_seeds: &[&[u8]], _program_id: &Pubkey) -> (Pubkey, u8) {
        (Pubkey([0u8; 32]), 255)
    }
}
impl AsRef<[u8]> for Pubkey {
    fn as_ref(&self) -> &[u8] { &self.0 }
}
`;

/**
 * Fold every generated file into one crate. Borsh's derive is a proc macro and
 * cannot be shimmed for a single-file `rustc` run, so the derive list is reduced
 * to the built-in derives here. Everything this generator actually decides —
 * types, field names/order, imports, PDA seed lifetimes — is still compiled
 * exactly as emitted. (The unmodified output, including the real Borsh derive,
 * was additionally verified against the borsh crate via cargo.)
 */
function buildCrateSource(files: { path: string; content: string }[]): string {
  const mods = files.map((f) => {
    const modName = f.path.replace(/\.rs$/, "");
    const body = f.content
      .replace(/^use borsh::.*$/gm, "")
      .replace(/^use solana_program::pubkey::Pubkey;$/gm, "use super::Pubkey;")
      .replace(/#\[derive\(BorshSerialize, BorshDeserialize, (.*)\)\]/g, "#[derive($1)]");
    return `pub mod ${modName} {\n${body}\n}`;
  });
  return PRELUDE + "\n" + mods.join("\n\n");
}

/**
 * Strip comments so assertions apply to real code, not to prose copied from
 * ontology descriptions (which legitimately mention `Pubkey`, `COption<...>`).
 */
function codeOnly(content: string): string {
  return content
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("generated Rust — memory correctness", () => {
  it("never emits non-Rust types, stubs, or heap/panic slop", () => {
    for (const concept of concepts) {
      const { path } = generateConceptRustFile(concept);
      const content = codeOnly(generateConceptRustFile(concept).content);
      const where = `${path} (${concept.canonicalName})`;

      // Ontology type names must never leak through as Rust types.
      expect(content, where).not.toMatch(/: publicKey\b/);
      expect(content, where).not.toMatch(/COption</);
      // No stubs, no panics.
      expect(content, where).not.toContain("unimplemented!(");
      expect(content, where).not.toContain("todo!(");
      expect(content, where).not.toContain(".unwrap()");
      expect(content, where).not.toContain(".expect(");
      // No gratuitous heap indirection or cloning.
      expect(content, where).not.toMatch(/\bBox</);
      expect(content, where).not.toMatch(/\bRc</);
      expect(content, where).not.toMatch(/\bArc</);
      expect(content, where).not.toContain(".clone()");
      expect(content, where).not.toContain(".to_vec()");
    }
  });

  it("imports exactly the external types it uses", () => {
    for (const concept of concepts) {
      const { content, path } = generateConceptRustFile(concept);
      // Compare real code usage (not doc comments) against the import list.
      const usesPubkey = /\bPubkey\b/.test(codeOnly(content).replace(/^use .*$/gm, ""));
      const importsPubkey = content.includes("use solana_program::pubkey::Pubkey;");
      expect(usesPubkey, `${path}: Pubkey usage and import must agree`).toBe(importsPubkey);
    }
  });

  it("derives PDA addresses for real, with borrowed seeds", () => {
    const withSeeds = concepts.filter((c) => (c.pdaSeeds?.length ?? 0) > 0);
    expect(withSeeds.length).toBeGreaterThan(0);
    for (const concept of withSeeds) {
      const { content, path } = generateConceptRustFile(concept);
      expect(content, path).toContain("Pubkey::find_program_address(");
      // Typed, borrowed seed parameters — not an untyped catch-all slice.
      expect(content, path).not.toContain("seeds: &[&[u8]]");
    }
  });

  it.skipIf(!hasRustc())("compiles with rustc --deny warnings (all concepts)", () => {
    const dir = mkdtempSync(join(tmpdir(), "rust-compile-"));
    try {
      const files = concepts.map((c) => generateConceptRustFile(c));
      const src = join(dir, "lib.rs");
      writeFileSync(src, buildCrateSource(files));

      // Throws (failing the test) with rustc's diagnostics if anything is wrong.
      execFileSync(
        "rustc",
        [
          "--edition",
          "2021",
          "--crate-type",
          "lib",
          "--deny",
          "warnings",
          "-o",
          join(dir, "out.rlib"),
          src,
        ],
        { encoding: "utf-8", stdio: "pipe" },
      );
      expect(files.length).toBe(concepts.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
