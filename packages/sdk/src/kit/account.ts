/**
 * Generic typed account fetcher.
 * Fetches raw account data and decodes it using a provided decoder function.
 */

import { PublicKey } from "@solana/web3.js";

export interface RawAccountData {
  pubkey: string;
  lamports: bigint;
  data: Uint8Array;
  owner: string;
  executable: boolean;
  rentEpoch: bigint;
}

export type AccountDecoder<T> = (data: Uint8Array) => T;

interface FetchedAccountInfo {
  lamports: number;
  data: Buffer | Uint8Array;
  owner: string | { toBase58(): string };
  executable: boolean;
  rentEpoch: number;
}

function ownerToBase58(owner: string | { toBase58(): string }): string {
  return typeof owner === "string" ? owner : owner.toBase58();
}

/**
 * Fetch and decode an account using a web3.js Connection.
 * @param connection web3.js Connection instance
 * @param address Account address to fetch
 * @param decoder Function to decode raw bytes into typed object
 * @param expectedOwner Optional program ID to validate account ownership
 */
export async function fetchAccount<T>(
  connection: unknown,
  address: string,
  decoder: AccountDecoder<T>,
  expectedOwner?: string,
): Promise<T | null> {
  const conn = connection as {
    getAccountInfo: (addr: PublicKey) => Promise<FetchedAccountInfo | null>;
  };

  const info = await conn.getAccountInfo(new PublicKey(address));
  if (!info) return null;

  if (expectedOwner && ownerToBase58(info.owner) !== expectedOwner) {
    throw new Error(
      `Account owner mismatch: expected ${expectedOwner}, got ${ownerToBase58(info.owner)}`,
    );
  }

  const data = info.data instanceof Buffer ? new Uint8Array(info.data) : (info.data as Uint8Array);

  return decoder(data);
}

/**
 * Fetch multiple accounts and decode them.
 */
export async function fetchMultipleAccounts<T>(
  connection: unknown,
  addresses: string[],
  decoder: AccountDecoder<T>,
  expectedOwner?: string,
): Promise<(T | null)[]> {
  const conn = connection as {
    getMultipleAccountsInfo: (addrs: PublicKey[]) => Promise<Array<FetchedAccountInfo | null>>;
  };

  const infos = await conn.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)));

  return infos.map((info) => {
    if (!info) return null;

    if (expectedOwner && ownerToBase58(info.owner) !== expectedOwner) {
      return null;
    }

    const data =
      info.data instanceof Buffer ? new Uint8Array(info.data) : (info.data as Uint8Array);

    return decoder(data);
  });
}
