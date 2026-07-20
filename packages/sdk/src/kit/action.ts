/**
 * Action builder for composing typed instructions into transactions.
 * Supports simulation before sending (per safety guardrail W009).
 */

export interface ActionInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: Uint8Array;
}

export class ActionBuilder {
  private instructions: ActionInstruction[] = [];
  private _feePayer?: string;
  private _computeUnitLimit?: number;
  private _computeUnitPrice?: bigint;

  /** Add an instruction to the action */
  addInstruction(ix: ActionInstruction): this {
    this.instructions.push(ix);
    return this;
  }

  /** Set the fee payer */
  setFeePayer(payer: string): this {
    this._feePayer = payer;
    return this;
  }

  /** Set compute unit limit */
  setComputeUnitLimit(limit: number): this {
    this._computeUnitLimit = limit;
    return this;
  }

  /** Set compute unit price (prioritization fee in micro-lamports per CU) */
  setComputeUnitPrice(price: bigint): this {
    this._computeUnitPrice = price;
    return this;
  }

  /** Get all instructions including compute budget if set */
  getInstructions(): ActionInstruction[] {
    const all: ActionInstruction[] = [];

    if (this._computeUnitLimit !== undefined) {
      all.push({
        programId: "ComputeBudget111111111111111111111111111111",
        accounts: [],
        data: encodeComputeUnitLimit(this._computeUnitLimit),
      });
    }

    if (this._computeUnitPrice !== undefined) {
      all.push({
        programId: "ComputeBudget111111111111111111111111111111",
        accounts: [],
        data: encodeComputeUnitPrice(this._computeUnitPrice),
      });
    }

    all.push(...this.instructions);
    return all;
  }

  /** Get the fee payer */
  get feePayer(): string | undefined {
    return this._feePayer;
  }

  /**
   * Simulate the transaction without sending it.
   * Per W009 safety guardrail: always simulate before sending.
   */
  async simulate(connection: unknown): Promise<unknown> {
    const web3 = await import("@solana/web3.js");
    const { Transaction, TransactionInstruction, PublicKey } = web3;
    const conn = connection as {
      simulateTransaction: (tx: unknown, opts?: unknown) => Promise<unknown>;
    };

    const tx = new Transaction();
    for (const ix of this.getInstructions()) {
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
    if (this._feePayer) {
      tx.feePayer = new PublicKey(this._feePayer);
    }
    return conn.simulateTransaction(tx);
  }

  /**
   * Build and return the instructions without sending.
   * The caller is responsible for signing and sending.
   */
  build(): ActionInstruction[] {
    return this.getInstructions();
  }
}

function encodeComputeUnitLimit(limit: number): Uint8Array {
  const data = new Uint8Array(5);
  data[0] = 2; // ComputeBudgetInstructionType::SetComputeUnitLimit
  const view = new DataView(data.buffer);
  view.setUint32(1, limit, true);
  return data;
}

function encodeComputeUnitPrice(price: bigint): Uint8Array {
  const data = new Uint8Array(9);
  data[0] = 3; // ComputeBudgetInstructionType::SetComputeUnitPrice
  const view = new DataView(data.buffer);
  view.setBigUint64(1, price, true);
  return data;
}
