import type { Concept } from "@solana-ontology/core";

/**
 * Generate a typed fetch helper for a concept.
 */
export function generateQuery(concept: Concept): string {
  const name = concept.canonicalName;
  const fnName = `fetch${name}`;

  return [
    `/**`,
    ` * Fetch and decode a ${name} account from the blockchain.`,
    ` * @param rpc RPC endpoint or connection`,
    ` * @param address Account address to fetch`,
    ` * @returns Decoded ${name} or null if account doesn't exist`,
    ` */`,
    `export async function ${fnName}(`,
    `  rpc: unknown,`,
    `  address: string,`,
    `): Promise<${name} | null> {`,
    `  // TODO: Implement using @solana/kit rpcApi or web3.js Connection`,
    `  // 1. Fetch account data via getAccountInfo`,
    `  // 2. Check owner program matches expected`,
    `  // 3. Decode using decode${name}()`,
    `  throw new Error(\`${fnName} not yet implemented — requires runtime SDK\`);`,
    `}`,
  ].join("\n");
}

/**
 * Generate a batch fetch helper for a concept.
 */
export function generateBatchQuery(concept: Concept): string {
  const name = concept.canonicalName;
  const fnName = `fetchMultiple${name}s`;

  return [
    `/**`,
    ` * Fetch and decode multiple ${name} accounts in a single RPC call.`,
    ` * @param rpc RPC endpoint or connection`,
    ` * @param addresses Array of account addresses`,
    ` * @returns Array of decoded ${name} or null for each address`,
    ` */`,
    `export async function ${fnName}(`,
    `  rpc: unknown,`,
    `  addresses: string[],`,
    `): Promise<(${name} | null)[]> {`,
    `  // TODO: Implement using getMultipleAccountsInfo`,
    `  throw new Error(\`${fnName} not yet implemented — requires runtime SDK\`);`,
    `}`,
  ].join("\n");
}
