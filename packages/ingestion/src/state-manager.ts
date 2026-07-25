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

  /**
   * Process an account update event.
   * Upserts the account state and records the modification for the slot.
   */
  processAccountUpdate(event: AccountUpdateEvent): AccountState {
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

    return state;
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
  }
}
