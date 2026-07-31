import type { Concept } from "@solana-ontology/core";
// Type-only import — erased at compile time, so it adds no runtime/bundle cost
// and does not require web3.js to be resolvable at call sites that never touch it.
import type { Connection } from "@solana/web3.js";

export interface OntologyClientConfig {
  /** RPC endpoint URL */
  rpcUrl: string;
  /** WebSocket endpoint URL (optional) */
  wsUrl?: string;
  /** Cluster name (mainnet-beta, devnet, testnet) */
  cluster?: string;
  /** Default commitment level */
  commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Handle to the lazily-initialized @solana/kit client. `kit` is left as
 * `unknown` because Kit's surface is resolved dynamically and it is only an
 * optional peer dependency — callers narrow it themselves.
 */
export interface KitClient {
  /** The imported @solana/kit module namespace. */
  kit: unknown;
  /** A ready-to-use Kit RPC client (from createSolanaRpc), e.g. `rpc.getSlot().send()`. */
  rpc: unknown;
  rpcUrl: string;
}

/**
 * Build a Kit RPC client from the imported @solana/kit module namespace.
 *
 * `createSolanaRpc(url)` is Kit's canonical RPC-client factory; when it is
 * absent (older/newer surface) we fall back to the transport-composed form
 * `createRpc({ api: createSolanaRpcApi(), transport: createDefaultRpcTransport({ url }) })`.
 * Feature-detected so it stays tolerant across Kit versions.
 */
export function buildKitRpc(kit: Record<string, unknown>, rpcUrl: string): unknown {
  const createSolanaRpc = kit.createSolanaRpc as ((url: string) => unknown) | undefined;
  if (typeof createSolanaRpc === "function") {
    return createSolanaRpc(rpcUrl);
  }

  const createRpc = kit.createRpc as ((cfg: unknown) => unknown) | undefined;
  const createHttpTransport = kit.createDefaultRpcTransport as
    ((cfg: { url: string }) => unknown) | undefined;
  const createApi = kit.createSolanaRpcApi as ((cfg?: unknown) => unknown) | undefined;
  if (
    typeof createRpc === "function" &&
    typeof createHttpTransport === "function" &&
    typeof createApi === "function"
  ) {
    return createRpc({ api: createApi(), transport: createHttpTransport({ url: rpcUrl }) });
  }

  throw new Error(
    "Installed @solana/kit does not expose createSolanaRpc (or createRpc + createDefaultRpcTransport); cannot build an RPC client.",
  );
}

/**
 * OntologyClient — central runtime client wrapping @solana/kit or web3.js
 * with ontology-typed methods for account fetching, PDA derivation,
 * action building, and queries.
 *
 * When @solana/kit is available, initKit() builds a Kit RPC client via
 * createSolanaRpc. Otherwise, initWeb3() falls back to the web3.js adapter.
 */
export class OntologyClient {
  readonly config: OntologyClientConfig;
  private _concepts: Map<string, Concept> = new Map();
  private _kitClient: KitClient | null = null;
  private _web3Connection: Connection | null = null;

  constructor(config: OntologyClientConfig) {
    this.config = config;
  }

  /**
   * Register a set of ontology concepts with this client.
   * This enables typed fetch/decode operations.
   */
  registerConcepts(concepts: Concept[]): void {
    for (const concept of concepts) {
      this._concepts.set(concept.canonicalName, concept);
    }
  }

  /**
   * Get a registered concept by canonical name.
   */
  getConcept(name: string): Concept | undefined {
    return this._concepts.get(name);
  }

  /**
   * List all registered concept names.
   */
  listConcepts(): string[] {
    return Array.from(this._concepts.keys());
  }

  /**
   * Get the underlying Kit client if available.
   * Throws if @solana/kit is not installed.
   */
  getKitClient(): KitClient {
    if (!this._kitClient) {
      throw new Error(
        "@solana/kit client not initialized. Install @solana/kit and call initKit().",
      );
    }
    return this._kitClient;
  }

  /**
   * Initialize the Kit client: import @solana/kit and build a real RPC client
   * from the configured endpoint via Kit's standard `createSolanaRpc` factory.
   * Requires @solana/kit to be installed (optional peer dependency).
   */
  async initKit(): Promise<void> {
    let kit: Record<string, unknown>;
    try {
      kit = (await import("@solana/kit")) as unknown as Record<string, unknown>;
    } catch {
      throw new Error("@solana/kit is not installed. Install it with: pnpm add @solana/kit");
    }

    const rpc = buildKitRpc(kit, this.config.rpcUrl);
    this._kitClient = { kit, rpc, rpcUrl: this.config.rpcUrl };
  }

  /**
   * Get the initialized Kit RPC client (from {@link initKit}).
   * Throws if Kit has not been initialized.
   */
  getKitRpc(): unknown {
    return this.getKitClient().rpc;
  }

  /**
   * Initialize the web3.js v1 connection as a fallback.
   */
  async initWeb3(): Promise<void> {
    const { Connection } = await import("@solana/web3.js");
    this._web3Connection = new Connection(this.config.rpcUrl, {
      commitment: this.config.commitment ?? "confirmed",
      wsEndpoint: this.config.wsUrl,
    });
  }

  /**
   * Get the underlying web3.js Connection if available.
   */
  getWeb3Connection(): Connection {
    if (!this._web3Connection) {
      throw new Error("web3.js Connection not initialized. Call initWeb3() first.");
    }
    return this._web3Connection;
  }
}
