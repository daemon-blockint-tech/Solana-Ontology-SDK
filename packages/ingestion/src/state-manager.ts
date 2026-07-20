/**
 * Stateful processing with commitment tracking and reorg handling.
 * Maintains current state keyed by account pubkey (upsert model).
 * Historical states are tracked as transaction events.
 */

import type {
  AccountUpdateEvent,
  TransactionEvent,
  AccountState,
  StateSnapshot,
  CommitmentLevel,
} from "./types.js";

export class StateManager {
  /** Primary state: keyed by account pubkey, only latest state */
  private accounts = new Map<string, AccountState>();
  /** Pending transactions not yet finalized */
  private pendingTx = new Map<string, { signature: string; slot: number; commitment: CommitmentLevel }>();
  /** Slot → account pubkeys modified in that slot (for reorg rollback) */
  private slotModifications = new Map<number, Set<string>>();
  /** Slot → transaction signatures in that slot */
  private slotTransactions = new Map<number, Set<string>>();
  /** Current highest processed slot */
  private currentSlot = 0;

  /**
   * Process an account update event.
   * Upserts the account state and records the modification for the slot.
   */
  processAccountUpdate(event: AccountUpdateEvent): AccountState {
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

    this.accounts.set(event.pubkey, state);

    // Track modifications per slot for reorg rollback
    if (!this.slotModifications.has(event.slot)) {
      this.slotModifications.set(event.slot, new Set());
    }
    this.slotModifications.get(event.slot)!.add(event.pubkey);

    if (event.slot > this.currentSlot) {
      this.currentSlot = event.slot;
    }

    return state;
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

    // Remove from pending if finalized
    if (event.commitment === "finalized") {
      this.pendingTx.delete(event.signature);
    }
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
      // Rollback account modifications
      const modifiedAccounts = this.slotModifications.get(slot);
      if (modifiedAccounts) {
        for (const pubkey of modifiedAccounts) {
          const state = this.accounts.get(pubkey);
          if (state && state.slot === slot) {
            // Mark as reorged — in a real implementation we'd restore previous state
            // For now, we remove the account from primary state
            this.accounts.delete(pubkey);
            affectedAccounts.push(pubkey);
          }
        }
        this.slotModifications.delete(slot);
      }

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

    // Update current slot
    if (droppedSlot <= this.currentSlot) {
      this.currentSlot = Math.max(0, droppedSlot - 1);
    }

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
    return Array.from(this.accounts.values()).filter((a) => a.owner === owner);
  }

  /**
   * Get all pending (non-finalized) transactions.
   */
  getPendingTransactions(): Array<{ signature: string; slot: number; commitment: CommitmentLevel }> {
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

    for (const acc of snapshot.accounts) {
      this.accounts.set(acc.pubkey, {
        pubkey: acc.pubkey,
        lamports: acc.lamports,
        owner: acc.owner,
        data: new Uint8Array(acc.data),
        executable: acc.executable,
        rentEpoch: acc.rentEpoch,
        slot: acc.slot,
        commitment: acc.commitment as CommitmentLevel,
        updatedAt: acc.updatedAt,
      });
    }

    for (const tx of snapshot.pendingTransactions) {
      this.pendingTx.set(tx.signature, {
        signature: tx.signature,
        slot: tx.slot,
        commitment: tx.commitment as CommitmentLevel,
      });
    }

    this.currentSlot = snapshot.slot;
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.accounts.clear();
    this.pendingTx.clear();
    this.slotModifications.clear();
    this.slotTransactions.clear();
    this.currentSlot = 0;
  }
}
