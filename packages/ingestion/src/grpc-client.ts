/**
 * Yellowstone gRPC client — interface-based stub.
 * Works without actual gRPC dependency installed.
 * Real implementation injects a gRPC client at runtime.
 */

import type {
  AccountUpdateEvent,
  TransactionEvent,
  BlockEvent,
  SlotEvent,
  SubscriptionFilter,
  CommitmentLevel,
} from "./types.js";

export type AccountUpdateCallback = (event: AccountUpdateEvent) => void;
export type TransactionCallback = (event: TransactionEvent) => void;
export type BlockCallback = (event: BlockEvent) => void;
export type SlotCallback = (event: SlotEvent) => void;

export interface GrpcClientConfig {
  endpoint: string;
  authToken?: string;
  commitment?: CommitmentLevel;
  reconnectIntervalMs?: number;
  maxReconnects?: number;
}

/**
 * Yellowstone gRPC client for streaming Solana validator events.
 *
 * This is an interface-based stub — the actual gRPC transport is injected
 * at runtime. In production, you'd pass a real @yellowstone/grpc client.
 * In development/testing, you can use the MockYellowstoneClient.
 */
export class YellowstoneClient {
  private config: GrpcClientConfig;
  private connected = false;
  private accountCallbacks: AccountUpdateCallback[] = [];
  private transactionCallbacks: TransactionCallback[] = [];
  private blockCallbacks: BlockCallback[] = [];
  private slotCallbacks: SlotCallback[] = [];
  private grpcClient: unknown = null;

  constructor(config: GrpcClientConfig) {
    this.config = {
      reconnectIntervalMs: 5000,
      maxReconnects: 10,
      ...config,
    };
  }

  /**
   * Inject a real gRPC client implementation.
   * If not called, the client operates in mock/stub mode.
   */
  injectClient(client: unknown): void {
    this.grpcClient = client;
  }

  /**
   * Connect to the Yellowstone gRPC endpoint.
   */
  async connect(): Promise<void> {
    if (this.grpcClient) {
      // Real gRPC client — call its connect method
      const client = this.grpcClient as { connect?: () => Promise<void> };
      if (client.connect) await client.connect();
    }
    this.connected = true;
  }

  /**
   * Subscribe to account updates with optional filtering.
   */
  subscribe(filter: SubscriptionFilter): void {
    if (!this.connected) {
      throw new Error("Not connected. Call connect() first.");
    }
    if (this.grpcClient) {
      const client = this.grpcClient as { subscribe?: (f: SubscriptionFilter) => void };
      if (client.subscribe) client.subscribe(filter);
    }
  }

  /**
   * Register a callback for account update events.
   */
  onAccountUpdate(callback: AccountUpdateCallback): this {
    this.accountCallbacks.push(callback);
    return this;
  }

  /**
   * Register a callback for transaction events.
   */
  onTransaction(callback: TransactionCallback): this {
    this.transactionCallbacks.push(callback);
    return this;
  }

  /**
   * Register a callback for block events.
   */
  onBlock(callback: BlockCallback): this {
    this.blockCallbacks.push(callback);
    return this;
  }

  /**
   * Register a callback for slot events.
   */
  onSlotUpdate(callback: SlotCallback): this {
    this.slotCallbacks.push(callback);
    return this;
  }

  /**
   * Emit an account update event to all registered callbacks.
   * Used internally by the gRPC stream handler or by mock clients.
   */
  emitAccountUpdate(event: AccountUpdateEvent): void {
    for (const cb of this.accountCallbacks) {
      try {
        cb(event);
      } catch {
        /* ignore callback errors */
      }
    }
  }

  /**
   * Emit a transaction event to all registered callbacks.
   */
  emitTransaction(event: TransactionEvent): void {
    for (const cb of this.transactionCallbacks) {
      try {
        cb(event);
      } catch {
        /* ignore callback errors */
      }
    }
  }

  /**
   * Emit a block event to all registered callbacks.
   */
  emitBlock(event: BlockEvent): void {
    for (const cb of this.blockCallbacks) {
      try {
        cb(event);
      } catch {
        /* ignore callback errors */
      }
    }
  }

  /**
   * Emit a slot event to all registered callbacks.
   */
  emitSlotUpdate(event: SlotEvent): void {
    for (const cb of this.slotCallbacks) {
      try {
        cb(event);
      } catch {
        /* ignore callback errors */
      }
    }
  }

  /**
   * Disconnect from the gRPC endpoint.
   */
  disconnect(): void {
    this.connected = false;
    this.accountCallbacks = [];
    this.transactionCallbacks = [];
    this.blockCallbacks = [];
    this.slotCallbacks = [];
  }

  isConnected(): boolean {
    return this.connected;
  }
}
