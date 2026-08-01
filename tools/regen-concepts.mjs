#!/usr/bin/env node
// Regenerate ontology/concepts/generated/ from the vendored IDLs in
// ontology/idls/. Requires the workspace to be built (`pnpm build`).
// Usage: pnpm regen:concepts
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "packages/cli/dist/index.js");
const idlDir = join(root, "ontology/idls");
const outRoot = join(root, "ontology/concepts/generated");

const idls = readdirSync(idlDir).filter((f) => f.endsWith(".json"));
if (idls.length === 0) {
  console.error(`No IDL files found in ${idlDir}`);
  process.exit(1);
}

for (const idl of idls) {
  const name = basename(idl, ".json");
  const outDir = join(outRoot, name);
  rmSync(outDir, { recursive: true, force: true });
  console.log(`── ${name}`);
  execFileSync(process.execPath, [cli, "idl", join(idlDir, idl), "--out", outDir], {
    stdio: "inherit",
  });
}
console.log(`✓ Regenerated concepts for ${idls.length} IDL(s) into ${outRoot}`);
