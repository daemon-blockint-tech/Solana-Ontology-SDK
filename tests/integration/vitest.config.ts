import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["**/integration.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@solana-ontology/core": resolve(__dirname, "../../packages/ontology-core/src/index.ts"),
      "@solana-ontology/idl-parser": resolve(__dirname, "../../packages/idl-parser/src/index.ts"),
      "@solana-ontology/oms": resolve(__dirname, "../../packages/ontology-oms/src/index.ts"),
      "@solana-ontology/mcp-server": resolve(__dirname, "../../packages/mcp-server/src/index.ts"),
      "@solana-ontology/generator-client": resolve(__dirname, "../../packages/generator-client/src/index.ts"),
    },
  },
});
