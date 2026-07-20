/**
 * Generic typed account fetcher.
 * Fetches raw account data and decodes it using a provided decoder function.
 */

export interface RawAccountData {
  pubkey: string;
  lamports: bigint;
  data: Uint8Array;
  owner: string;
  executable: boolean;
  rentEpoch: bigint;
}

export type AccountDecoder<T> = (data: Uint8Array) => T;

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
    getAccountInfo: (
      addr: string,
      opts?: { encoding: string },
    ) => Promise<{
      lamports: number;
      data: Buffer | Uint8Array;
      owner: string;
      executable: boolean;
      rentEpoch: number;
    } | null>;
  };

  const info = await conn.getAccountInfo(address, { encoding: "base64" });
  if (!info) return null;

  if (expectedOwner && info.owner !== expectedOwner) {
    throw new Error(
      `Account owner mismatch: expected ${expectedOwner}, got ${info.owner}`,
    );
  }

  const data =
    info.data instanceof Buffer
      ? new Uint8Array(info.data)
      : (info.data as Uint8Array);

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
    getMultipleAccountsInfo: (
      addrs: string[],
      opts?: { encoding: string },
    ) => Promise<
      Array<{
        lamports: number;
        data: Buffer | Uint8Array;
        owner: string;
        executable: boolean;
        rentEpoch: number;
      } | null>
    >;
  };

  const infos = await conn.getMultipleAccountsInfo(addresses, {
    encoding: "base64",
  });

  return infos.map((info) => {
    if (!info) return null;

    if (expectedOwner && info.owner !== expectedOwner) {
      return null;
    }

    const data =
      info.data instanceof Buffer
        ? new Uint8Array(info.data)
        : (info.data as Uint8Array);

    return decoder(data);
  });
}
