import { join, resolve } from "node:path";

/** Default paths relative to the project root */
export const DEFAULT_ONTOLOGY_ROOT = resolve(
  join(process.cwd(), "ontology"),
);
export const DEFAULT_CONCEPTS_DIR = join(DEFAULT_ONTOLOGY_ROOT, "concepts");
export const DEFAULT_TS_OUTPUT = join(
  process.cwd(),
  "packages",
  "sdk",
  "src",
  "generated",
);
export const DEFAULT_RUST_OUTPUT = join(
  process.cwd(),
  "generated",
  "rust",
);

export interface CliConfig {
  ontologyRoot: string;
  conceptsDir: string;
  tsOutputDir: string;
  rustOutputDir: string;
}

export function resolveConfig(overrides?: Partial<CliConfig>): CliConfig {
  return {
    ontologyRoot: overrides?.ontologyRoot ?? DEFAULT_ONTOLOGY_ROOT,
    conceptsDir: overrides?.conceptsDir ?? DEFAULT_CONCEPTS_DIR,
    tsOutputDir: overrides?.tsOutputDir ?? DEFAULT_TS_OUTPUT,
    rustOutputDir: overrides?.rustOutputDir ?? DEFAULT_RUST_OUTPUT,
  };
}
