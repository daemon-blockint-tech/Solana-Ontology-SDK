/**
 * Web3jsAdapter — bridges web3.js v1 Connection to ontology SDK types.
 * Allows existing web3.js v1 codebases to use the ontology SDK
 * without full migration to @solana/kit.
 */

import type { OntologyClientConfig } from "../kit/client.js";

export interface Web3AccountInfo {
  lamports: number;
  data: Buffer;
  owner: string;
  executable: boolean;
  rentEpoch: number;
}

/** Shape returned by a real web3.js Connection (owner is a PublicKey) */
interface RawWeb3AccountInfo {
  lamports: number;
  data: Buffer;
  owner: string | { toBase58(): string };
  executable: boolean;
  rentEpoch?: number;
}

function normalizeAccountInfo(info: RawWeb3AccountInfo): Web3AccountInfo {
  return {
    lamports: info.lamports,
    data: info.data,
    owner: typeof info.owner === "string" ? info.owner : info.owner.toBase58(),
    executable: info.executable,
    rentEpoch: info.rentEpoch ?? 0,
  };
}

export class Web3jsAdapter {
  readonly config: OntologyClientConfig;
  private _connection: unknown = null;

  constructor(config: OntologyClientConfig) {
    this.config = config;
  }

  /** Initialize the underlying web3.js Connection */
  async init(): Promise<void> {
    const { Connection } = await import("@solana/web3.js");
    this._connection = new Connection(this.config.rpcUrl, {
      commitment: this.config.commitment ?? "confirmed",
      wsEndpoint: this.config.wsUrl,
    });
  }

  /** Get the raw Connection */
  get connection(): unknown {
    if (!this._connection) {
      throw new Error("Web3jsAdapter not initialized. Call init() first.");
    }
    return this._connection;
  }

  /** Fetch account info as a typed object */
  async getAccountInfo(address: string): Promise<Web3AccountInfo | null> {
    const { PublicKey } = await import("@solana/web3.js");
    const conn = this._connection as {
      getAccountInfo: (addr: InstanceType<typeof PublicKey>) => Promise<RawWeb3AccountInfo | null>;
    };
    const info = await conn.getAccountInfo(new PublicKey(address));
    return info ? normalizeAccountInfo(info) : null;
  }

  /** Fetch multiple accounts */
  async getMultipleAccountsInfo(addresses: string[]): Promise<(Web3AccountInfo | null)[]> {
    const { PublicKey } = await import("@solana/web3.js");
    const conn = this._connection as {
      getMultipleAccountsInfo: (
        addrs: InstanceType<typeof PublicKey>[],
      ) => Promise<(RawWeb3AccountInfo | null)[]>;
    };
    const infos = await conn.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)));
    return infos.map((info) => (info ? normalizeAccountInfo(info) : null));
  }

  /** Get balance in lamports */
  async getBalance(address: string): Promise<number> {
    const { PublicKey } = await import("@solana/web3.js");
    const conn = this._connection as {
      getBalance: (addr: InstanceType<typeof PublicKey>) => Promise<number>;
    };
    return conn.getBalance(new PublicKey(address));
  }

  /** Get latest blockhash */
  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const conn = this._connection as {
      getLatestBlockhash: (opts?: { commitment: string }) => Promise<{
        blockhash: string;
        lastValidBlockHeight: number;
      }>;
    };
    return conn.getLatestBlockhash({
      commitment: this.config.commitment ?? "confirmed",
    });
  }
}
