import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  isIdlV0,
  isIdlV1,
  migrateIdlV0ToV1,
  generateConceptsFromIdl,
} from "@solana-ontology/idl-parser";
import { validateAll } from "@solana-ontology/core";
import { stringify as yamlStringify } from "yaml";
import type { CliConfig } from "../config.js";

export function idlCommand(
  idlPath: string,
  config: CliConfig,
  outputDir?: string,
  codemodOnly?: boolean,
): void {
  const raw = JSON.parse(readFileSync(idlPath, "utf-8"));

  let v1;
  if (isIdlV0(raw)) {
    console.log("Detected legacy IDL v0, running codemod...");
    v1 = migrateIdlV0ToV1(raw);
    console.log(`✓ Migrated to v1: ${v1.metadata.name} v${v1.metadata.version}`);
  } else if (isIdlV1(raw)) {
    console.log("Detected modern IDL v1");
    v1 = raw;
  } else {
    console.error("✗ Unrecognized IDL format");
    process.exit(1);
  }

  if (codemodOnly) {
    const outPath = outputDir ?? idlPath.replace(/\.json$/, ".v1.json");
    writeFileSync(outPath, JSON.stringify(v1, null, 2));
    console.log(`✓ Wrote normalized IDL to: ${outPath}`);
    return;
  }

  const concepts = generateConceptsFromIdl(v1);
  console.log(`Generated ${concepts.length} concepts from IDL`);

  const result = validateAll(concepts);
  if (!result.valid) {
    console.error(`✗ Validation failed with ${result.errors.length} error(s)`);
    for (const err of result.errors.slice(0, 5)) {
      console.error(`  ${err.conceptName}: ${err.message}`);
    }
  }

  const outDir = outputDir ?? join(config.ontologyRoot, "concepts", "generated");
  mkdirSync(outDir, { recursive: true });

  for (const concept of concepts) {
    const { _sourceFile, ...data } = concept;
    const fileName = concept.canonicalName.replace(/([A-Z])/g, "_$1").replace(/^_/, "").toLowerCase() + ".yaml";
    const filePath = join(outDir, fileName);
    writeFileSync(filePath, yamlStringify(data));
    console.log(`  ✓ ${concept.canonicalName} → ${filePath}`);
  }

  console.log(`✓ Wrote ${concepts.length} concept files to ${outDir}`);
}
