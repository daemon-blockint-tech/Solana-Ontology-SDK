import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    exclude: ["tests/integration/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@solana-ontology/core": resolve(__dirname, "packages/ontology-core/src/index.ts"),
    },
  },
});
