/**
 * Blockhash management with TTL-based caching.
 * Solana blockhashes are valid for 150 slots (~60 seconds).
 */

export interface BlockhashInfo {
  blockhash: string;
  lastValidBlockHeight: number;
  fetchedAt: number;
}

export class BlockhashCache {
  private cache: BlockhashInfo | null = null;
  private ttlMs: number;
  private fetchFn: () => Promise<BlockhashInfo>;
  private inflight: Promise<BlockhashInfo> | null = null;

  constructor(fetchFn: () => Promise<BlockhashInfo>, ttlMs = 55_000) {
    this.fetchFn = fetchFn;
    this.ttlMs = ttlMs;
  }

  async getBlockhash(): Promise<BlockhashInfo> {
    if (this.cache && this.isFresh(this.cache)) {
      return this.cache;
    }
    // Dedup: if a fetch is already in-flight, return the same promise
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.fetchFn().finally(() => {
      this.inflight = null;
    });
    this.cache = await this.inflight;
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
    this.inflight = null;
  }

  private isFresh(info: BlockhashInfo): boolean {
    return Date.now() - info.fetchedAt < this.ttlMs;
  }
}

/**
 * Fetch latest blockhash from a web3.js Connection.
 */
export async function fetchLatestBlockhash(connection: unknown): Promise<BlockhashInfo> {
  const conn = connection as {
    getLatestBlockhash: (opts?: unknown) => Promise<{
      blockhash: string;
      lastValidBlockHeight: number;
    }>;
  };
  const result = await conn.getLatestBlockhash();
  return {
    blockhash: result.blockhash,
    lastValidBlockHeight: result.lastValidBlockHeight,
    fetchedAt: Date.now(),
  };
}
