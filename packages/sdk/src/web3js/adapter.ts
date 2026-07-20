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
    const conn = this._connection as {
      getAccountInfo: (
        addr: string,
        opts?: { encoding: string },
      ) => Promise<Web3AccountInfo | null>;
    };
    return conn.getAccountInfo(address, { encoding: "base64" });
  }

  /** Fetch multiple accounts */
  async getMultipleAccountsInfo(
    addresses: string[],
  ): Promise<(Web3AccountInfo | null)[]> {
    const conn = this._connection as {
      getMultipleAccountsInfo: (
        addrs: string[],
        opts?: { encoding: string },
      ) => Promise<(Web3AccountInfo | null)[]>;
    };
    return conn.getMultipleAccountsInfo(addresses, { encoding: "base64" });
  }

  /** Get balance in lamports */
  async getBalance(address: string): Promise<number> {
    const conn = this._connection as {
      getBalance: (addr: string) => Promise<number>;
    };
    return conn.getBalance(address);
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
