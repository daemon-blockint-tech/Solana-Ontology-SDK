import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@solana-ontology/core": resolve(__dirname, "packages/ontology-core/src/index.ts"),
    },
  },
});
