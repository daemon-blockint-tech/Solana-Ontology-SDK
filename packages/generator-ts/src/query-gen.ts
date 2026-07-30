import type { Concept } from "@solana-ontology/core";
import { hasAccountLayout } from "./layout-gen.js";

/** Import line for generated files that use the SDK account-fetch runtime. */
export const SDK_QUERY_IMPORT =
  'import { fetchAccount, fetchMultipleAccounts } from "@solana-ontology/sdk";';

/**
 * Generate a typed fetch helper for a concept.
 *
 * Concepts with an `accountLayout` get a real fetch wired to the SDK's
 * fetchAccount (getAccountInfo + owner check + generated decoder). Concepts
 * without a layout have no runtime decoder, so their fetch throws an explicit
 * "no accountLayout" error — unsupported, not unimplemented.
 */
export function generateQuery(concept: Concept): string {
  const name = concept.canonicalName;
  const fnName = `fetch${name}`;

  if (!hasAccountLayout(concept)) {
    return [
      `/**`,
      ` * Fetching is unavailable for ${name}: its concept declares no accountLayout,`,
      ` * so there is no decoder to apply. Add one (or regenerate from the program IDL).`,
      ` */`,
      `export async function ${fnName}(_rpc: unknown, _address: string): Promise<never> {`,
      `  throw new Error(`,
      `    "${fnName}: concept has no accountLayout in the ontology — add one (or run \`solana-ontology idl <program.json>\`) to enable fetching",`,
      `  );`,
      `}`,
    ].join("\n");
  }

  const ownerArg = concept.programId ? `, "${concept.programId}"` : "";
  return [
    `/**`,
    ` * Fetch and decode a ${name} account from the blockchain.`,
    ` * @param connection web3.js Connection instance`,
    ` * @param address Account address to fetch`,
    ` * @returns Decoded ${name}AccountData or null if the account doesn't exist`,
    ` */`,
    `export async function ${fnName}(`,
    `  connection: unknown,`,
    `  address: string,`,
    `): Promise<${name}AccountData | null> {`,
    `  return fetchAccount(connection, address, decode${name}${ownerArg});`,
    `}`,
  ].join("\n");
}

/**
 * Generate a batch fetch helper for a concept. Same support rule as
 * {@link generateQuery}.
 */
export function generateBatchQuery(concept: Concept): string {
  const name = concept.canonicalName;
  const fnName = `fetchMultiple${name}s`;

  if (!hasAccountLayout(concept)) {
    return [
      `/**`,
      ` * Batch fetching is unavailable for ${name}: its concept declares no accountLayout.`,
      ` */`,
      `export async function ${fnName}(_rpc: unknown, _addresses: string[]): Promise<never> {`,
      `  throw new Error(`,
      `    "${fnName}: concept has no accountLayout in the ontology — add one (or run \`solana-ontology idl <program.json>\`) to enable fetching",`,
      `  );`,
      `}`,
    ].join("\n");
  }

  const ownerArg = concept.programId ? `, "${concept.programId}"` : "";
  return [
    `/**`,
    ` * Fetch and decode multiple ${name} accounts in a single RPC call.`,
    ` * @param connection web3.js Connection instance`,
    ` * @param addresses Array of account addresses`,
    ` * @returns Array of decoded ${name}AccountData or null for each address`,
    ` */`,
    `export async function ${fnName}(`,
    `  connection: unknown,`,
    `  addresses: string[],`,
    `): Promise<(${name}AccountData | null)[]> {`,
    `  return fetchMultipleAccounts(connection, addresses, decode${name}${ownerArg});`,
    `}`,
  ].join("\n");
}
