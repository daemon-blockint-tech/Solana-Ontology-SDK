/**
 * Event processor — transforms raw gRPC events into ontology-typed objects.
 * Supports registered decoders for Borsh deserialization per program.
 */

import type { AccountUpdateEvent, AccountState } from "./types.js";

export type AccountDecoderFn = (data: Uint8Array) => Record<string, unknown>;

export interface DecodedAccount {
  pubkey: string;
  slot: number;
  commitment: string;
  programId: string;
  decoded: Record<string, unknown>;
  raw: Uint8Array;
}

export class EventProcessor {
  /** Registered decoders keyed by program ID */
  private decoders = new Map<string, AccountDecoderFn>();
  /** Callbacks for decoded account updates */
  private decodedCallbacks: ((account: DecodedAccount) => void)[] = [];

  /**
   * Register a decoder function for a specific program ID.
   * The decoder deserializes Borsh-encoded account data into typed fields.
   */
  registerDecoder(programId: string, decoderFn: AccountDecoderFn): this {
    this.decoders.set(programId, decoderFn);
    return this;
  }

  /**
   * Register a callback for decoded account updates.
   */
  onDecodedAccount(callback: (account: DecodedAccount) => void): this {
    this.decodedCallbacks.push(callback);
    return this;
  }

  /**
   * Process an account update event.
   * If a decoder is registered for the account owner, it will be decoded.
   */
  processAccountUpdate(event: AccountUpdateEvent): DecodedAccount | null {
    const decoder = this.decoders.get(event.owner);
    let decoded: Record<string, unknown> = {};

    if (decoder) {
      try {
        decoded = decoder(event.data);
      } catch {
        // Decoding failed — return raw data only
        decoded = { _decodeError: true };
      }
    }

    const result: DecodedAccount = {
      pubkey: event.pubkey,
      slot: event.slot,
      commitment: event.commitment,
      programId: event.owner,
      decoded,
      raw: event.data,
    };

    for (const cb of this.decodedCallbacks) {
      try { cb(result); } catch { /* ignore callback errors */ }
    }

    return result;
  }

  /**
   * Check if a decoder is registered for a program ID.
   */
  hasDecoder(programId: string): boolean {
    return this.decoders.has(programId);
  }

  /**
   * Get all registered program IDs.
   */
  getRegisteredPrograms(): string[] {
    return Array.from(this.decoders.keys());
  }
}
