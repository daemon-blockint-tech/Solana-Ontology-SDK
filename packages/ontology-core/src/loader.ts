import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Concept } from "./types.js";

interface CacheEntry {
  mtime: number;
  concept: Concept;
}

const loaderCache = new Map<string, CacheEntry>();

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
 * Load a concept from a file, using mtime cache to skip unchanged files.
 */
function loadCached(filePath: string, ontologyRoot: string): Concept {
  const mtime = statSync(filePath).mtimeMs;
  const cached = loaderCache.get(filePath);
  if (cached && cached.mtime === mtime) {
    return cached.concept;
  }
  const content = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(content) as Concept;
  parsed._sourceFile = relative(ontologyRoot, filePath);
  loaderCache.set(filePath, { mtime, concept: parsed });
  return parsed;
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
    concepts.push(loadCached(filePath, ontologyRoot));
  }

  return concepts;
}

/**
 * Load a single concept YAML file.
 * @param filePath Absolute path to the YAML file
 * @param ontologyRoot Absolute path to the ontology root
 */
export function loadConcept(filePath: string, ontologyRoot: string): Concept {
  return loadCached(filePath, ontologyRoot);
}

/**
 * Clear the loader cache. Useful for tests or explicit invalidation.
 */
export function clearLoaderCache(): void {
  loaderCache.clear();
}
