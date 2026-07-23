/**
 * File emitter — writes generated client files to disk.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedClientFile, ClientGenConfig } from "./types.js";

export function emitClientPackage(files: GeneratedClientFile[], config: ClientGenConfig): string[] {
  mkdirSync(config.outputDir, { recursive: true });

  const writtenPaths: string[] = [];

  for (const file of files) {
    const filePath = join(config.outputDir, file.path);
    writeFileSync(filePath, file.content);
    writtenPaths.push(filePath);
  }

  // Generate package.json for the client package
  const pkgJson = {
    name: config.packageName,
    version: "0.1.0",
    type: "module",
    main: "index.js",
    types: "index.d.ts",
    dependencies: {
      "@solana-ontology/sdk": "^0.1.0",
    },
  };
  writeFileSync(join(config.outputDir, "package.json"), JSON.stringify(pkgJson, null, 2));
  writtenPaths.push(join(config.outputDir, "package.json"));

  return writtenPaths;
}
