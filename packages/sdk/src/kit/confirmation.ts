/**
 * Confirmation tracker — tracks pending transactions through commitment levels.
 * Events: confirmed, finalized, failed, timeout.
 */

import { TransactionEventEmitter } from "./event-emitter.js";

export type TransactionStatus = "pending" | "confirmed" | "finalized" | "failed" | "timeout";

export interface PendingTransaction {
  signature: string;
  status: TransactionStatus;
  submittedAt: number;
  confirmedAt?: number;
  finalizedAt?: number;
  error?: string;
}

export class ConfirmationTracker {
  private pending = new Map<string, PendingTransaction>();
  private emitter = new TransactionEventEmitter();
  private pollIntervalMs: number;
  private timeoutMs: number;

  constructor(options?: { pollIntervalMs?: number; timeoutMs?: number }) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 2000;
    this.timeoutMs = options?.timeoutMs ?? 60_000;
  }

  /**
   * Track a transaction signature for confirmation.
   * Returns the pending transaction entry.
   */
  track(signature: string): PendingTransaction {
    const entry: PendingTransaction = {
      signature,
      status: "pending",
      submittedAt: Date.now(),
    };
    this.pending.set(signature, entry);
    return entry;
  }

  /**
   * Start polling for confirmation of a transaction.
   * Uses web3.js connection to check signature status.
   */
  async waitForConfirmation(signature: string, connection: unknown): Promise<PendingTransaction> {
    const entry = this.pending.get(signature);
    if (!entry) throw new Error(`Transaction ${signature} is not being tracked`);

    const conn = connection as {
      getSignatureStatuses: (sigs: string[]) => Promise<{
        value: { confirmationStatus: string | null; err: unknown }[];
      }>;
    };

    const startTime = Date.now();

    while (Date.now() - startTime < this.timeoutMs) {
      const result = await conn.getSignatureStatuses([signature]);
      const status = result.value[0];

      if (!status) {
        await sleep(this.pollIntervalMs);
        continue;
      }

      if (status.err) {
        entry.status = "failed";
        entry.error = JSON.stringify(status.err);
        this.emitter.emit("failed", entry);
        return entry;
      }

      if (status.confirmationStatus === "confirmed" && entry.status === "pending") {
        entry.status = "confirmed";
        entry.confirmedAt = Date.now();
        this.emitter.emit("confirmed", entry);
      }

      if (status.confirmationStatus === "finalized") {
        entry.status = "finalized";
        entry.finalizedAt = Date.now();
        this.emitter.emit("finalized", entry);
        return entry;
      }

      await sleep(this.pollIntervalMs);
    }

    entry.status = "timeout";
    this.emitter.emit("timeout", entry);
    return entry;
  }

  /**
   * Register a callback for a specific event.
   */
  on(event: Parameters<TransactionEventEmitter["on"]>[0], callback: (data: unknown) => void): this {
    this.emitter.on(event, callback);
    return this;
  }

  /**
   * Get the status of a tracked transaction.
   */
  getStatus(signature: string): TransactionStatus | undefined {
    return this.pending.get(signature)?.status;
  }

  /**
   * Get all pending (not finalized/failed/timeout) transactions.
   */
  getPending(): PendingTransaction[] {
    return Array.from(this.pending.values()).filter(
      (tx) => tx.status === "pending" || tx.status === "confirmed",
    );
  }

  /**
   * Remove a transaction from tracking.
   */
  forget(signature: string): void {
    this.pending.delete(signature);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
