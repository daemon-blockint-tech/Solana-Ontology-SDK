/**
 * Typed event emitter for transaction lifecycle events.
 */

export type TransactionEventName =
  | "simulated"
  | "signed"
  | "dispatched"
  | "confirmed"
  | "finalized"
  | "failed"
  | "timeout"
  | "computeAdjusted";

export type TransactionEventListener = (data: unknown) => void;

export class TransactionEventEmitter {
  private listeners = new Map<TransactionEventName, Set<TransactionEventListener>>();

  on(event: TransactionEventName, listener: TransactionEventListener): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: TransactionEventName, listener: TransactionEventListener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: TransactionEventName, data?: unknown): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(data);
      } catch {
        // Listener errors should not break the pipeline
      }
    });
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
