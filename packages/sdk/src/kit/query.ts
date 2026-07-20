/**
 * Type-safe query helpers for fetching ontology-typed accounts.
 */

import type { Concept } from "@solana-ontology/core";
import { fetchAccount, fetchMultipleAccounts } from "./account.js";
import type { AccountDecoder } from "./account.js";

export interface QueryOptions {
  expectedOwner?: string;
  commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Create a typed query function for a specific concept.
 * Returns a function that fetches and decodes accounts of that concept type.
 */
export function createConceptQuery<T>(
  connection: unknown,
  decoder: AccountDecoder<T>,
  options?: QueryOptions,
) {
  return {
    fetch: (address: string) =>
      fetchAccount(connection, address, decoder, options?.expectedOwner),

    fetchMultiple: (addresses: string[]) =>
      fetchMultipleAccounts(
        connection,
        addresses,
        decoder,
        options?.expectedOwner,
      ),
  };
}

/**
 * OntologyQuery — registry of typed query functions per concept.
 */
export class OntologyQuery {
  private _queries = new Map<string, ReturnType<typeof createConceptQuery>>();

  /**
   * Register a typed query for a concept.
   */
  register<T>(
    conceptName: string,
    connection: unknown,
    decoder: AccountDecoder<T>,
    options?: QueryOptions,
  ): void {
    this._queries.set(conceptName, createConceptQuery(connection, decoder, options));
  }

  /**
   * Get a registered query for a concept.
   */
  get(conceptName: string): ReturnType<typeof createConceptQuery> | undefined {
    return this._queries.get(conceptName);
  }

  /**
   * List all registered concept query names.
   */
  list(): string[] {
    return Array.from(this._queries.keys());
  }
}
