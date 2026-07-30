/**
 * Stateful processing with commitment tracking and reorg handling.
 * Maintains current state keyed by account pubkey (upsert model).
 * Historical states are tracked as transaction events.
 */

import { MetricsRegistry } from "@solana-ontology/core";
import type {
  AccountUpdateEvent,
  TransactionEvent,
  AccountState,
  StateSnapshot,
  CommitmentLevel,
} from "./types.js";

/** Live state/versioning/idempotency/contention snapshot for the StateManager. */
export interface StateManagerStats {
  /** Monotonic version — bumps on every mutation (unlike slot, which rewinds on reorg). */
  version: number;
  currentSlot: number;
  accounts: number;
  owners: number;
  pendingTx: number;
  trackedSlots: number;
  /** Highest slot known to be finalized — reorg history at or below it is pruned. */
  finalizedSlot: number;
  reorgs: number;
  accountUpdates: number;
  idempotentUpdates: number;
}

export class StateManager {
  /** Primary state: keyed by account pubkey, only latest state */
  private accounts = new Map<string, AccountState>();
  /** Pending transactions not yet finalized */
  private pendingTx = new Map<
    string,
    { signature: string; slot: number; commitment: CommitmentLevel }
  >();
  /** Slot → account pubkeys modified in that slot (for reorg rollback) */
  private slotModifications = new Map<number, Set<string>>();
  /** Slot → transaction signatures in that slot */
  private slotTransactions = new Map<number, Set<string>>();
  /** Slot → (pubkey → previous AccountState) for reorg restoration */
  private previousAccounts = new Map<number, Map<string, AccountState | undefined>>();
  /** Secondary index: owner → Set of account pubkeys */
  private ownerIndex = new Map<string, Set<string>>();
  /** Current highest processed slot */
  private currentSlot = 0;
  /** Highest slot known to be finalized — slots at or below can never reorg. */
  private finalizedSlot = 0;
  /** Monotonic state version — bumps on every mutation (slot can rewind on reorg). */
  private stateVersion = 0;
  /** Instrumentation — owned by this instance (no global state). */
  private metrics = new MetricsRegistry();

  constructor() {
    // Live gauges read from the real owning fields at snapshot time.
    this.metrics.registerGauge("state_version", () => this.stateVersion);
    this.metrics.registerGauge("state_current_slot", () => this.currentSlot);
    this.metrics.registerGauge("state_accounts", () => this.accounts.size);
    this.metrics.registerGauge("state_owners", () => this.ownerIndex.size);
    this.metrics.registerGauge("state_pending_tx", () => this.pendingTx.size);
    this.metrics.registerGauge("state_tracked_slots", () => this.slotModifications.size);
  }

  /**
   * True when `event` would not change the current state for its pubkey (a
   * duplicate/replayed update) — the upsert model makes re-applying it a no-op.
   */
  private isNoOp(event: AccountUpdateEvent): boolean {
    const cur = this.accounts.get(event.pubkey);
    if (!cur) return false;
    return (
      cur.slot === event.slot &&
      cur.commitment === event.commitment &&
      cur.lamports === event.lamports &&
      cur.owner === event.owner &&
      cur.executable === event.executable &&
      cur.rentEpoch === event.rentEpoch &&
      bytesEqual(cur.data, event.data)
    );
  }

  /**
   * Process an account update event.
   * Upserts the account state and records the modification for the slot.
   */
  processAccountUpdate(event: AccountUpdateEvent): AccountState {
    // Idempotency: a replayed identical event is a no-op — count it and return
    // the existing state unchanged (no version bump, no reorg-history churn).
    if (this.isNoOp(event)) {
      this.metrics.inc("state_idempotent_updates_total");
      return this.accounts.get(event.pubkey)!;
    }

    const prevState = this.accounts.get(event.pubkey);

    // Save previous state for reorg restoration
    if (!this.previousAccounts.has(event.slot)) {
      this.previousAccounts.set(event.slot, new Map());
    }
    const slotPrev = this.previousAccounts.get(event.slot)!;
    if (!slotPrev.has(event.pubkey)) {
      slotPrev.set(event.pubkey, prevState);
    }

    const state: AccountState = {
      pubkey: event.pubkey,
      lamports: event.lamports,
      owner: event.owner,
      data: event.data,
      executable: event.executable,
      rentEpoch: event.rentEpoch,
      slot: event.slot,
      commitment: event.commitment,
      updatedAt: Date.now(),
    };

    // Update owner index: remove from old owner, add to new owner
    if (prevState && prevState.owner !== event.owner) {
      this.removeFromOwnerIndex(prevState.owner, event.pubkey);
    }
    this.addToOwnerIndex(event.owner, event.pubkey);

    this.accounts.set(event.pubkey, state);

    // Track modifications per slot for reorg rollback
    if (!this.slotModifications.has(event.slot)) {
      this.slotModifications.set(event.slot, new Set());
    }
    this.slotModifications.get(event.slot)!.add(event.pubkey);

    if (event.slot > this.currentSlot) {
      this.currentSlot = event.slot;
    }

    if (event.commitment === "finalized") {
      this.advanceFinalizedSlot(event.slot);
    }

    this.stateVersion++;
    this.metrics.inc("state_account_updates_total");
    return state;
  }

  /**
   * Advance the finalized watermark and prune reorg-tracking history for all
   * slots at or below it — finalized slots can never reorg, so retaining their
   * previous-state buffers would grow memory without bound on a long-running
   * stream.
   */
  private advanceFinalizedSlot(finalizedSlot: number): void {
    if (finalizedSlot <= this.finalizedSlot) return;
    this.finalizedSlot = finalizedSlot;
    for (const slot of this.slotModifications.keys()) {
      if (slot <= finalizedSlot) this.slotModifications.delete(slot);
    }
    for (const slot of this.slotTransactions.keys()) {
      if (slot <= finalizedSlot) this.slotTransactions.delete(slot);
    }
    for (const slot of this.previousAccounts.keys()) {
      if (slot <= finalizedSlot) this.previousAccounts.delete(slot);
    }
  }

  /**
   * Mark all slots at or below `slot` as finalized, pruning their reorg
   * history. Call this from a slot-status ("finalized") stream when account
   * and transaction events alone don't carry finalized commitments.
   */
  markFinalized(slot: number): void {
    this.advanceFinalizedSlot(slot);
  }

  /** Highest slot known to be finalized. */
  getFinalizedSlot(): number {
    return this.finalizedSlot;
  }

  private addToOwnerIndex(owner: string, pubkey: string): void {
    if (!this.ownerIndex.has(owner)) {
      this.ownerIndex.set(owner, new Set());
    }
    this.ownerIndex.get(owner)!.add(pubkey);
  }

  private removeFromOwnerIndex(owner: string, pubkey: string): void {
    const set = this.ownerIndex.get(owner);
    if (set) {
      set.delete(pubkey);
      if (set.size === 0) {
        this.ownerIndex.delete(owner);
      }
    }
  }

  /**
   * Process a transaction event.
   * Tracks pending transactions until finalized.
   */
  processTransaction(event: TransactionEvent): void {
    this.pendingTx.set(event.signature, {
      signature: event.signature,
      slot: event.slot,
      commitment: event.commitment,
    });

    if (!this.slotTransactions.has(event.slot)) {
      this.slotTransactions.set(event.slot, new Set());
    }
    this.slotTransactions.get(event.slot)!.add(event.signature);

    // Remove from pending if finalized, and prune reorg history for
    // now-finalized slots
    if (event.commitment === "finalized") {
      this.pendingTx.delete(event.signature);
      this.advanceFinalizedSlot(event.slot);
    }

    this.stateVersion++;
    this.metrics.inc("state_transactions_total");
  }

  /**
   * Handle a blockchain reorganization by rolling back state for reorged slots.
   * Removes all account modifications and transactions from slots >= droppedSlot.
   */
  handleReorg(droppedSlot: number): { affectedAccounts: string[]; affectedTransactions: string[] } {
    const affectedAccounts: string[] = [];
    const affectedTransactions: string[] = [];

    // Find all slots >= droppedSlot that have modifications
    const slotsToRollback = Array.from(this.slotModifications.keys())
      .filter((slot) => slot >= droppedSlot)
      .sort((a, b) => b - a); // Roll back in reverse order

    for (const slot of slotsToRollback) {
      // Rollback account modifications — restore previous state
      const modifiedAccounts = this.slotModifications.get(slot);
      const slotPrev = this.previousAccounts.get(slot);
      if (modifiedAccounts) {
        for (const pubkey of modifiedAccounts) {
          const currentState = this.accounts.get(pubkey);
          if (currentState && currentState.slot === slot) {
            const prevState = slotPrev?.get(pubkey);
            // Remove current owner from index
            this.removeFromOwnerIndex(currentState.owner, pubkey);

            if (prevState) {
              // Restore previous state
              this.accounts.set(pubkey, prevState);
              this.addToOwnerIndex(prevState.owner, pubkey);
            } else {
              // Account didn't exist before this slot — remove it
              this.accounts.delete(pubkey);
            }
            affectedAccounts.push(pubkey);
          }
        }
        this.slotModifications.delete(slot);
      }

      // Clean up previous state tracking for this slot
      this.previousAccounts.delete(slot);

      // Rollback transactions
      const txs = this.slotTransactions.get(slot);
      if (txs) {
        for (const sig of txs) {
          this.pendingTx.delete(sig);
          affectedTransactions.push(sig);
        }
        this.slotTransactions.delete(slot);
      }
    }

    // Update current slot to the highest slot still known to be processed —
    // droppedSlot - 1 may never have existed (slots can be skipped)
    if (droppedSlot <= this.currentSlot) {
      let maxRemaining = this.finalizedSlot;
      for (const slot of this.slotModifications.keys()) {
        if (slot > maxRemaining) maxRemaining = slot;
      }
      for (const slot of this.slotTransactions.keys()) {
        if (slot > maxRemaining) maxRemaining = slot;
      }
      this.currentSlot = Math.max(0, maxRemaining);
    }

    this.stateVersion++;
    this.metrics.inc("state_reorgs_total");
    this.metrics.inc("state_reorg_affected_accounts_total", undefined, affectedAccounts.length);
    return { affectedAccounts, affectedTransactions };
  }

  /**
   * Get the current state of an account by pubkey.
   */
  getAccountState(pubkey: string): AccountState | undefined {
    return this.accounts.get(pubkey);
  }

  /**
   * Get all account states for a given owner program.
   */
  getAccountsByOwner(owner: string): AccountState[] {
    const pubkeys = this.ownerIndex.get(owner);
    if (!pubkeys) return [];
    return Array.from(pubkeys)
      .map((pk) => this.accounts.get(pk))
      .filter((a): a is AccountState => a !== undefined);
  }

  /**
   * Get all pending (non-finalized) transactions.
   */
  getPendingTransactions(): Array<{
    signature: string;
    slot: number;
    commitment: CommitmentLevel;
  }> {
    return Array.from(this.pendingTx.values());
  }

  /**
   * Get the current highest processed slot.
   */
  getCurrentSlot(): number {
    return this.currentSlot;
  }

  /**
   * Get total number of tracked accounts.
   */
  getAccountCount(): number {
    return this.accounts.size;
  }

  /**
   * Create a serializable snapshot of the current state.
   */
  snapshot(): StateSnapshot {
    return {
      accounts: Array.from(this.accounts.values()).map((a) => ({
        pubkey: a.pubkey,
        lamports: a.lamports,
        owner: a.owner,
        data: Array.from(a.data),
        executable: a.executable,
        rentEpoch: a.rentEpoch,
        slot: a.slot,
        commitment: a.commitment,
        updatedAt: a.updatedAt,
      })),
      pendingTransactions: Array.from(this.pendingTx.values()),
      slot: this.currentSlot,
      timestamp: Date.now(),
    };
  }

  /**
   * Restore state from a snapshot.
   */
  restore(snapshot: StateSnapshot): void {
    this.accounts.clear();
    this.pendingTx.clear();
    this.slotModifications.clear();
    this.slotTransactions.clear();
    this.previousAccounts.clear();
    this.ownerIndex.clear();

    for (const acc of snapshot.accounts) {
      const state: AccountState = {
        pubkey: acc.pubkey,
        lamports: acc.lamports,
        owner: acc.owner,
        data: new Uint8Array(acc.data),
        executable: acc.executable,
        rentEpoch: acc.rentEpoch,
        slot: acc.slot,
        commitment: acc.commitment as CommitmentLevel,
        updatedAt: acc.updatedAt,
      };
      this.accounts.set(acc.pubkey, state);
      this.addToOwnerIndex(acc.owner, acc.pubkey);
    }

    for (const tx of snapshot.pendingTransactions) {
      this.pendingTx.set(tx.signature, {
        signature: tx.signature,
        slot: tx.slot,
        commitment: tx.commitment as CommitmentLevel,
      });
    }

    this.currentSlot = snapshot.slot;
    this.finalizedSlot = 0;
    this.stateVersion++;
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.accounts.clear();
    this.pendingTx.clear();
    this.slotModifications.clear();
    this.slotTransactions.clear();
    this.previousAccounts.clear();
    this.ownerIndex.clear();
    this.currentSlot = 0;
    this.finalizedSlot = 0;
    this.stateVersion++;
  }

  /** Monotonic state version — bumps on every mutation (unlike slot). */
  getVersion(): number {
    return this.stateVersion;
  }

  /** Live state/versioning/idempotency/contention snapshot. */
  stats(): StateManagerStats {
    return {
      version: this.stateVersion,
      currentSlot: this.currentSlot,
      accounts: this.accounts.size,
      owners: this.ownerIndex.size,
      pendingTx: this.pendingTx.size,
      trackedSlots: this.slotModifications.size,
      finalizedSlot: this.finalizedSlot,
      reorgs: this.metrics.getCounterTotal("state_reorgs_total"),
      accountUpdates: this.metrics.getCounterTotal("state_account_updates_total"),
      idempotentUpdates: this.metrics.getCounterTotal("state_idempotent_updates_total"),
    };
  }

  /** The metrics registry (for a host to expose, e.g. via a /metrics endpoint). */
  getMetrics(): MetricsRegistry {
    return this.metrics;
  }

  /** Prometheus text exposition of this StateManager's metrics. */
  renderProm(): string {
    return this.metrics.renderProm();
  }
}

/** Byte-wise equality for account data buffers. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
