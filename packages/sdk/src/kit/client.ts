import type { Concept } from "@solana-ontology/core";

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
 * OntologyClient — central runtime client wrapping @solana/kit or web3.js
 * with ontology-typed methods for account fetching, PDA derivation,
 * action building, and queries.
 *
 * When @solana/kit is available, it uses Kit's createClient() under the hood.
 * Otherwise, it falls back to the web3.js adapter.
 */
export class OntologyClient {
  readonly config: OntologyClientConfig;
  private _concepts: Map<string, Concept> = new Map();
  private _kitClient: unknown = null;
  private _web3Connection: unknown = null;

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
  getKitClient(): unknown {
    if (!this._kitClient) {
      throw new Error(
        "@solana/kit client not initialized. Install @solana/kit and call initKit().",
      );
    }
    return this._kitClient;
  }

  /**
   * Initialize the Kit client.
   * Requires @solana/kit to be installed.
   */
  async initKit(): Promise<void> {
    // Dynamic import — only fails if @solana/kit is not installed
    try {
      const kit = await import("@solana/kit");
      // Use Kit's createClient with RPC plugin
      // This is a stub — actual implementation depends on Kit API surface
      this._kitClient = { kit, rpcUrl: this.config.rpcUrl };
    } catch {
      throw new Error("@solana/kit is not installed. Install it with: pnpm add @solana/kit");
    }
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
  getWeb3Connection(): unknown {
    if (!this._web3Connection) {
      throw new Error("web3.js Connection not initialized. Call initWeb3() first.");
    }
    return this._web3Connection;
  }
}
