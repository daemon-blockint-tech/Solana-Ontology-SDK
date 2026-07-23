/**
 * Compatibility conversion functions between web3.js v1 and Kit types.
 * These are thin wrappers that convert between the two type systems
 * so legacy code can interoperate with ontology-typed helpers.
 */

/**
 * Convert a web3.js PublicKey to a base58 string (Kit Address format).
 */
export function web3PubkeyToString(pubkey: unknown): string {
  const pk = pubkey as { toBase58: () => string };
  return pk.toBase58();
}

/**
 * Convert a base58 string to a web3.js PublicKey.
 */
export async function stringToWeb3Pubkey(address: string): Promise<unknown> {
  const { PublicKey } = await import("@solana/web3.js");
  return new PublicKey(address);
}

/**
 * Convert web3.js account data (Buffer) to Uint8Array (Kit format).
 */
export function web3DataToBytes(data: Buffer | Uint8Array): Uint8Array {
  if (data instanceof Buffer) {
    return new Uint8Array(data);
  }
  return data;
}

/**
 * Convert web3.js AccountInfo to a normalized format compatible with Kit.
 */
export interface NormalizedAccount {
  pubkey: string;
  lamports: bigint;
  data: Uint8Array;
  owner: string;
  executable: boolean;
  rentEpoch: bigint;
}

export function normalizeWeb3Account(
  pubkey: string,
  info: {
    lamports: number;
    data: Buffer | Uint8Array;
    owner: string;
    executable: boolean;
    rentEpoch: number;
  },
): NormalizedAccount {
  return {
    pubkey,
    lamports: BigInt(info.lamports),
    data: web3DataToBytes(info.data),
    owner: info.owner,
    executable: info.executable,
    rentEpoch: BigInt(info.rentEpoch),
  };
}
