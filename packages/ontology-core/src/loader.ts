import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Concept } from "./types.js";

/**
 * Recursively find all .yaml files under a directory.
 */
function findYamlFiles(dir: string, base: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...findYamlFiles(fullPath, base));
    } else if (extname(entry) === ".yaml" || extname(entry) === ".yml") {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Load all concept YAML files from an ontology concepts directory.
 * @param conceptsDir Absolute path to the `concepts/` directory
 * @param ontologyRoot Absolute path to the ontology root (for relative paths)
 * @returns Array of parsed Concept objects with _sourceFile set
 */
export function loadConcepts(conceptsDir: string, ontologyRoot: string): Concept[] {
  const yamlFiles = findYamlFiles(conceptsDir, ontologyRoot);
  const concepts: Concept[] = [];

  for (const filePath of yamlFiles) {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(content) as Concept;
    parsed._sourceFile = relative(ontologyRoot, filePath);
    concepts.push(parsed);
  }

  return concepts;
}

/**
 * Load a single concept YAML file.
 * @param filePath Absolute path to the YAML file
 * @param ontologyRoot Absolute path to the ontology root
 */
export function loadConcept(filePath: string, ontologyRoot: string): Concept {
  const content = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(content) as Concept;
  parsed._sourceFile = relative(ontologyRoot, filePath);
  return parsed;
}
