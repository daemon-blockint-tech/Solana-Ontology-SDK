/**
 * Yellowstone gRPC stream adapter with real reconnect/resubscribe behavior.
 *
 * The raw transport is injected as a factory (duck-typed against
 * @triton-one/yellowstone-grpc's client) so this package carries no hard gRPC
 * dependency, while the adapter owns everything the bare YellowstoneClient
 * stub does not: connection lifecycle, exponential-backoff reconnects,
 * filter resubscription after a drop, wire-format → internal-event
 * translation, and error surfacing.
 */

import { encodeBase58 } from "./base58.js";
import type {
  AccountUpdateEvent,
  TransactionEvent,
  SlotEvent,
  SubscriptionFilter,
  CommitmentLevel,
} from "./types.js";

// ── Wire shapes (duck-typed subset of yellowstone-grpc SubscribeUpdate) ────

type WirePubkey = Uint8Array | string;

export interface RawAccountUpdate {
  account?: {
    pubkey: WirePubkey;
    lamports: string | number | bigint;
    owner: WirePubkey;
    data: Uint8Array;
    executable: boolean;
    rentEpoch: string | number | bigint;
    txnSignature?: WirePubkey;
  };
  slot: string | number;
}

export interface RawTransactionUpdate {
  transaction?: {
    signature: WirePubkey;
    meta?: {
      fee?: string | number | bigint;
      logMessages?: string[];
      err?: unknown;
    };
  };
  slot: string | number;
}

export interface RawSlotUpdate {
  slot: string | number;
  parent?: string | number;
  status?: number | string;
}

/** One message from the Yellowstone subscribe stream. */
export interface RawSubscribeUpdate {
  account?: RawAccountUpdate;
  transaction?: RawTransactionUpdate;
  slot?: RawSlotUpdate;
}

/** Duck-typed gRPC bidi stream (node stream events + write). */
export interface RawSubscribeStream {
  on(event: "data", cb: (update: RawSubscribeUpdate) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  on(event: "end" | "close", cb: () => void): unknown;
  write(request: unknown): unknown;
  end?(): void;
  cancel?(): void;
}

export interface RawYellowstoneGrpcClient {
  subscribe(): Promise<RawSubscribeStream> | RawSubscribeStream;
}

/** Factory invoked on every (re)connect — returns a fresh raw client. */
export type YellowstoneClientFactory = () =>
  Promise<RawYellowstoneGrpcClient> | RawYellowstoneGrpcClient;

// ── Adapter ────────────────────────────────────────────────────────────────

export interface YellowstoneAdapterConfig {
  /** Commitment stamped on translated events (subscriptions are per-commitment) */
  commitment?: CommitmentLevel;
  /** Base reconnect delay; doubles per attempt (default 1000ms) */
  reconnectIntervalMs?: number;
  /** Max reconnect attempts before giving up (default 10) */
  maxReconnects?: number;
  /** Upper bound for a single backoff delay (default 30s) */
  maxBackoffMs?: number;
}

export type AdapterStatus = "idle" | "connecting" | "connected" | "reconnecting" | "stopped";

/** Yellowstone slot status codes (yellowstone-grpc SlotStatus). */
const SLOT_STATUS_FINALIZED = 2;

function toNumber(v: string | number | bigint | undefined, field: string): number {
  if (v === undefined) throw new Error(`Missing numeric field: ${field}`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric field ${field}: ${String(v)}`);
  return n;
}

function toBigInt(v: string | number | bigint | undefined, field: string): bigint {
  if (v === undefined) throw new Error(`Missing numeric field: ${field}`);
  try {
    return BigInt(typeof v === "number" ? Math.trunc(v) : v);
  } catch {
    throw new Error(`Invalid numeric field ${field}: ${String(v)}`);
  }
}

function toBase58(v: WirePubkey, field: string): string {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return encodeBase58(v);
  throw new Error(`Invalid pubkey field ${field}`);
}

export class YellowstoneStreamAdapter {
  private factory: YellowstoneClientFactory;
  private commitment: CommitmentLevel;
  private reconnectIntervalMs: number;
  private maxReconnects: number;
  private maxBackoffMs: number;

  private stream: RawSubscribeStream | null = null;
  private filters: SubscriptionFilter[] = [];
  private reconnectAttempts = 0;
  private _status: AdapterStatus = "idle";
  private stopping = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private accountCallbacks: Array<(e: AccountUpdateEvent) => void> = [];
  private transactionCallbacks: Array<(e: TransactionEvent) => void> = [];
  private slotCallbacks: Array<(e: SlotEvent) => void> = [];
  private finalizedSlotCallbacks: Array<(slot: number) => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];

  constructor(factory: YellowstoneClientFactory, config?: YellowstoneAdapterConfig) {
    this.factory = factory;
    this.commitment = config?.commitment ?? "confirmed";
    this.reconnectIntervalMs = config?.reconnectIntervalMs ?? 1000;
    this.maxReconnects = config?.maxReconnects ?? 10;
    this.maxBackoffMs = config?.maxBackoffMs ?? 30_000;
  }

  get status(): AdapterStatus {
    return this._status;
  }

  onAccountUpdate(cb: (e: AccountUpdateEvent) => void): this {
    this.accountCallbacks.push(cb);
    return this;
  }

  onTransaction(cb: (e: TransactionEvent) => void): this {
    this.transactionCallbacks.push(cb);
    return this;
  }

  onSlotUpdate(cb: (e: SlotEvent) => void): this {
    this.slotCallbacks.push(cb);
    return this;
  }

  /** Fires when a slot reaches finalized status (wire into StateManager.markFinalized). */
  onFinalizedSlot(cb: (slot: number) => void): this {
    this.finalizedSlotCallbacks.push(cb);
    return this;
  }

  /** Stream and callback errors are surfaced here — never swallowed. */
  onError(cb: (err: Error) => void): this {
    this.errorCallbacks.push(cb);
    return this;
  }

  /**
   * Register a subscription filter. Applied immediately when connected and
   * re-applied automatically after every reconnect.
   */
  subscribe(filter: SubscriptionFilter): this {
    this.filters.push(filter);
    if (this.stream) {
      this.writeSubscribeRequest(this.stream, filter);
    }
    return this;
  }

  /** Connect and begin streaming. Resolves once the first connection is up. */
  async start(): Promise<void> {
    if (this._status !== "idle" && this._status !== "stopped") {
      throw new Error(`Adapter already ${this._status}`);
    }
    this.stopping = false;
    this.reconnectAttempts = 0;
    await this.connectOnce();
  }

  /** Stop streaming and disable reconnects. */
  stop(): void {
    this.stopping = true;
    this._status = "stopped";
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stream) {
      this.stream.cancel?.();
      this.stream.end?.();
      this.stream = null;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async connectOnce(): Promise<void> {
    this._status = this.reconnectAttempts > 0 ? "reconnecting" : "connecting";
    const client = await this.factory();
    const stream = await client.subscribe();
    this.stream = stream;

    stream.on("data", (update: RawSubscribeUpdate) => {
      // A live message proves the connection is healthy — reset backoff
      this.reconnectAttempts = 0;
      this._status = "connected";
      try {
        this.handleUpdate(update);
      } catch (err) {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      }
    });
    stream.on("error", (err: Error) => {
      this.emitError(err);
      this.scheduleReconnect();
    });
    stream.on("end", () => this.scheduleReconnect());
    stream.on("close", () => this.scheduleReconnect());

    // (Re)apply all registered filters on the fresh stream
    for (const filter of this.filters) {
      this.writeSubscribeRequest(stream, filter);
    }
    this._status = "connected";
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.stream = null;

    if (this.reconnectAttempts >= this.maxReconnects) {
      this._status = "stopped";
      this.emitError(
        new Error(`Yellowstone stream lost and ${this.maxReconnects} reconnect attempts exhausted`),
      );
      return;
    }

    const delay = Math.min(
      this.reconnectIntervalMs * 2 ** this.reconnectAttempts,
      this.maxBackoffMs,
    );
    this.reconnectAttempts++;
    this._status = "reconnecting";
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectOnce().catch((err: unknown) => {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
        this.scheduleReconnect();
      });
    }, delay);
  }

  /** Translate a SubscriptionFilter into a yellowstone SubscribeRequest. */
  private writeSubscribeRequest(stream: RawSubscribeStream, filter: SubscriptionFilter): void {
    const commitmentMap: Record<CommitmentLevel, number> = {
      processed: 0,
      confirmed: 1,
      finalized: 2,
    };
    stream.write({
      accounts: {
        client: {
          account: filter.accounts ?? [],
          owner: [...(filter.accountOwners ?? []), ...(filter.programIds ?? [])],
          filters: [],
        },
      },
      transactions: {
        client: {
          vote: filter.vote ?? false,
          failed: filter.failed ?? true,
          accountInclude: filter.accounts ?? [],
          accountExclude: [],
          accountRequired: [],
        },
      },
      slots: { client: {} },
      commitment: commitmentMap[this.commitment],
    });
  }

  private handleUpdate(update: RawSubscribeUpdate): void {
    if (update.account?.account) {
      const acc = update.account.account;
      const event: AccountUpdateEvent = {
        pubkey: toBase58(acc.pubkey, "account.pubkey"),
        lamports: toBigInt(acc.lamports, "account.lamports"),
        owner: toBase58(acc.owner, "account.owner"),
        data: acc.data instanceof Uint8Array ? acc.data : new Uint8Array(0),
        executable: acc.executable === true,
        rentEpoch: toNumber(acc.rentEpoch ?? 0, "account.rentEpoch"),
        slot: toNumber(update.account.slot, "account.slot"),
        commitment: this.commitment,
        previousData: null,
      };
      this.emit(this.accountCallbacks, event);
    }

    if (update.transaction?.transaction) {
      const tx = update.transaction.transaction;
      const err = tx.meta?.err;
      const event: TransactionEvent = {
        signature: toBase58(tx.signature, "transaction.signature"),
        slot: toNumber(update.transaction.slot, "transaction.slot"),
        commitment: this.commitment,
        fee: toNumber(tx.meta?.fee ?? 0, "transaction.fee"),
        logs: tx.meta?.logMessages ?? [],
        writableAccounts: [],
        readonlyAccounts: [],
        error: err == null ? null : JSON.stringify(err),
      };
      this.emit(this.transactionCallbacks, event);
    }

    if (update.slot) {
      const slot = toNumber(update.slot.slot, "slot.slot");
      const event: SlotEvent = {
        slot,
        parent: toNumber(update.slot.parent ?? 0, "slot.parent"),
        root: 0,
        timestamp: Date.now(),
      };
      this.emit(this.slotCallbacks, event);

      const status = update.slot.status;
      if (status === SLOT_STATUS_FINALIZED || status === "finalized") {
        this.emit(this.finalizedSlotCallbacks, slot);
      }
    }
  }

  private emit<T>(callbacks: Array<(value: T) => void>, value: T): void {
    for (const cb of callbacks) {
      try {
        cb(value);
      } catch (err) {
        // Consumer errors must not kill the stream, but they are surfaced
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private emitError(err: Error): void {
    if (this.errorCallbacks.length === 0) return;
    for (const cb of this.errorCallbacks) {
      try {
        cb(err);
      } catch {
        // An error handler that itself throws is dropped — nothing sane to do
      }
    }
  }
}
