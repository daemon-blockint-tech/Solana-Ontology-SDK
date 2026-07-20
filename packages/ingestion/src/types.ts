// ── Ingestion Event Types ──────────────────────────────────────────────────

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

export interface AccountUpdateEvent {
  pubkey: string;
  lamports: number;
  owner: string;
  data: Uint8Array;
  executable: boolean;
  rentEpoch: number;
  slot: number;
  commitment: CommitmentLevel;
  /** Previous data (null if account is new) */
  previousData: Uint8Array | null;
}

export interface TransactionEvent {
  signature: string;
  slot: number;
  commitment: CommitmentLevel;
  fee: number;
  logs: string[];
  /** Accounts that were written by this transaction */
  writableAccounts: string[];
  /** Accounts that were read by this transaction */
  readonlyAccounts: string[];
  error: string | null;
}

export interface BlockEvent {
  slot: number;
  blockhash: string;
  blockHeight: number | null;
  parentSlot: number;
  commitment: CommitmentLevel;
}

export interface SlotEvent {
  parent: number;
  root: number;
  slot: number;
  timestamp: number;
}

// ── Subscription Filter ────────────────────────────────────────────────────

export interface SubscriptionFilter {
  /** Filter by program IDs (empty = all) */
  programIds?: string[];
  /** Filter by account owners (empty = all) */
  accountOwners?: string[];
  /** Filter by specific account pubkeys (empty = all) */
  accounts?: string[];
  /** Filter by slot range */
  startSlot?: number;
  endSlot?: number;
  /** Vote accounts only */
  vote?: boolean;
  /** Failed transactions only */
  failed?: boolean;
}

// ── State Snapshot ─────────────────────────────────────────────────────────

export interface AccountState {
  pubkey: string;
  lamports: number;
  owner: string;
  data: Uint8Array;
  executable: boolean;
  rentEpoch: number;
  slot: number;
  commitment: CommitmentLevel;
  updatedAt: number;
}

export interface StateSnapshot {
  accounts: Array<{
    pubkey: string;
    lamports: number;
    owner: string;
    data: number[];
    executable: boolean;
    rentEpoch: number;
    slot: number;
    commitment: string;
    updatedAt: number;
  }>;
  pendingTransactions: Array<{
    signature: string;
    slot: number;
    commitment: string;
  }>;
  slot: number;
  timestamp: number;
}
