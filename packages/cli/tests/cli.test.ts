import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("config", () => {
  it("should resolve with defaults", () => {
    const config = resolveConfig();
    expect(config.ontologyRoot).toContain("ontology");
    expect(config.conceptsDir).toContain("concepts");
    expect(config.tsOutputDir).toContain("generated");
    expect(config.rustOutputDir).toContain("rust");
  });

  it("should accept overrides", () => {
    const config = resolveConfig({
      ontologyRoot: "/custom/ontology",
      conceptsDir: "/custom/ontology/concepts",
    });
    expect(config.ontologyRoot).toBe("/custom/ontology");
    expect(config.conceptsDir).toBe("/custom/ontology/concepts");
  });
});
