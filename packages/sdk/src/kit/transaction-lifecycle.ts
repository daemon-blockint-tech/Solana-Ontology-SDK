/**
 * Transaction lifecycle orchestrator.
 * build → simulate → sign → dispatch → confirm
 *
 * Enforces safety guardrail W009: always simulate before sending.
 */

import type { ActionInstruction } from "./action.js";
import { ActionBuilder } from "./action.js";
import type { SignerProvider, SignedTransaction } from "./signer.js";
import { BlockhashCache, fetchLatestBlockhash, type BlockhashInfo } from "./blockhash.js";
import { ConfirmationTracker, type PendingTransaction } from "./confirmation.js";
import { TransactionEventEmitter } from "./event-emitter.js";

export interface TransactionLifecycleOptions {
  connection: unknown;
  signer: SignerProvider;
  feePayer: string;
  /** Skip simulation (not recommended — W009 guardrail) */
  skipSimulation?: boolean;
  /** Confirmation timeout in ms */
  confirmationTimeoutMs?: number;
}

export interface SimulationResult {
  success: boolean;
  logs?: string[];
  error?: string;
  unitsConsumed?: number;
}

export interface DispatchResult {
  signature: string;
  simulation: SimulationResult | null;
  confirmation: PendingTransaction | null;
  signedTx: SignedTransaction | null;
}

export class TransactionLifecycle {
  private events = new TransactionEventEmitter();
  private blockhashCache: BlockhashCache;
  private confirmationTracker: ConfirmationTracker;

  constructor(private options: TransactionLifecycleOptions) {
    this.blockhashCache = new BlockhashCache(
      () => fetchLatestBlockhash(options.connection),
    );
    this.confirmationTracker = new ConfirmationTracker({
      timeoutMs: options.confirmationTimeoutMs,
    });
  }

  /**
   * Execute the full transaction lifecycle:
   * 1. Build transaction from ActionBuilder
   * 2. Simulate (safety guardrail)
   * 3. Sign with signer provider
   * 4. Dispatch to network
   * 5. Wait for confirmation
   */
  async execute(builder: ActionBuilder): Promise<DispatchResult> {
    // 1. Build
    const instructions = builder.build();
    const blockhash = await this.blockhashCache.getBlockhash();

    // 2. Simulate (unless explicitly skipped)
    let simulation: SimulationResult | null = null;
    if (!this.options.skipSimulation) {
      simulation = await this.simulate(builder);
      this.events.emit("simulated", simulation);
      if (!simulation.success) {
        this.events.emit("failed", simulation);
        return {
          signature: "",
          simulation,
          confirmation: null,
          signedTx: null,
        };
      }
    }

    // 3. Sign
    const messageBytes = await this.buildMessageBytes(instructions, blockhash);
    const signedTx = await this.options.signer.signTransaction(messageBytes);
    this.events.emit("signed", signedTx);

    // 4. Dispatch
    const signature = await this.dispatch(signedTx);
    this.events.emit("dispatched", { signature });

    // 5. Confirm
    this.confirmationTracker.track(signature);
    const confirmation = await this.confirmationTracker.waitForConfirmation(
      signature,
      this.options.connection,
    );

    return { signature, simulation, confirmation, signedTx };
  }

  /**
   * Simulate the transaction without sending it.
   */
  async simulate(builder: ActionBuilder): Promise<SimulationResult> {
    try {
      const result = await builder.simulate(this.options.connection);
      const sim = result as {
        value: { err: unknown; logs?: string[]; unitsConsumed?: number };
      };
      const success = !sim.value?.err;
      return {
        success,
        logs: sim.value?.logs,
        error: sim.value?.err ? JSON.stringify(sim.value.err) : undefined,
        unitsConsumed: sim.value?.unitsConsumed,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Build serialized message bytes for signing.
   */
  private async buildMessageBytes(
    instructions: ActionInstruction[],
    blockhash: BlockhashInfo,
  ): Promise<Uint8Array> {
    const web3 = await import("@solana/web3.js");
    const { Transaction, TransactionInstruction, PublicKey } = web3;

    const tx = new Transaction();
    for (const ix of instructions) {
      tx.add(
        new TransactionInstruction({
          programId: new PublicKey(ix.programId),
          keys: ix.accounts.map((a) => ({
            pubkey: new PublicKey(a.pubkey),
            isSigner: a.isSigner,
            isWritable: a.isWritable,
          })),
          data: Buffer.from(ix.data),
        }),
      );
    }
    tx.feePayer = new PublicKey(this.options.feePayer);
    tx.recentBlockhash = blockhash.blockhash;

    // Serialize the message (not the full transaction — signing happens separately)
    const message = tx.compileMessage();
    return message.serialize();
  }

  /**
   * Dispatch a signed transaction to the network.
   */
  private async dispatch(signedTx: SignedTransaction): Promise<string> {
    const conn = this.options.connection as {
      sendRawTransaction: (raw: Uint8Array | Buffer, opts?: unknown) => Promise<string>;
    };
    return conn.sendRawTransaction(signedTx.serialized);
  }

  /**
   * Register an event listener.
   */
  on(event: Parameters<TransactionEventEmitter["on"]>[0], callback: (data: unknown) => void): this {
    this.events.on(event, callback);
    return this;
  }

  /**
   * Get the confirmation tracker for direct access.
   */
  getConfirmationTracker(): ConfirmationTracker {
    return this.confirmationTracker;
  }
}
