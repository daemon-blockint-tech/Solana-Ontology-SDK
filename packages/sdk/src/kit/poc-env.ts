/**
 * PoC Environment — TypeScript mirror of Neodyme's poc_framework::Environment trait.
 *
 * Provides a test harness for writing exploit tests against ontology concepts.
 * Wraps TransactionLifecycle with convenience methods for:
 * - Creating accounts (rent-exempt)
 * - Creating SPL token mints and accounts
 * - Minting tokens
 * - Executing raw instructions as transactions
 * - Fetching account state for assertions
 *
 * Usage:
 *   const env = new PoCEnvironment({ rpcUrl: "http://localhost:8899", payer: keypair });
 *   await env.createAccountRentExempt(someKeypair, 256, programId);
 *   const result = await env.executeAsTransaction([instruction], [signer]);
 *   const account = await env.getAccount(somePubkey);
 *
 * Inspired by: https://docs.rs/poc-framework/0.1.2/poc_framework/trait.Environment.html
 */

import type { ActionInstruction } from "./action.js";
import { ActionBuilder } from "./action.js";
import type { SignerProvider, SignedTransaction } from "./signer.js";
import type { RawAccountData } from "./account.js";

export interface PoCEnvironmentConfig {
  /** RPC endpoint URL (local validator or devnet) */
  rpcUrl: string;
  /** Fee payer keypair (web3.js Keypair-like object) */
  payer: unknown;
  /** Commitment level for confirms */
  commitment?: "processed" | "confirmed" | "finalized";
  /** Skip simulation (faster but less safe) */
  skipSimulation?: boolean;
  /** Confirmation timeout in ms */
  confirmationTimeoutMs?: number;
}

export interface PoCTransactionResult {
  /** Transaction signature */
  signature: string;
  /** Whether the transaction succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Transaction logs */
  logs?: string[];
  /** Compute units consumed */
  unitsConsumed?: number;
}

/**
 * IPoCEnvironment — formal interface for PoC test environments.
 *
 * Mirrors Neodyme's poc_framework::Environment trait.
 * Implementations:
 * - PoCEnvironment (default — wraps web3.js Connection)
 * - MockPoCEnvironment (for unit tests without a validator)
 *
 * This interface allows swapping backends (local validator, devnet, mock)
 * without changing exploit test code.
 */
export interface IPoCEnvironment {
  /** Get the fee payer's public key */
  payer(): string;

  /** Fetch a recent blockhash for transaction construction */
  getRecentBlockhash(): Promise<string>;

  /** Get rent-exempt lamports for an account of the given data size */
  getRentExemption(dataSize: number): Promise<number>;

  /** Fetch an account's raw data. Returns null if account doesn't exist. */
  getAccount(pubkey: string): Promise<RawAccountData | null>;

  /** Execute a raw transaction and wait for confirmation */
  executeTransaction(
    instructions: ActionInstruction[],
    extraSigners?: unknown[],
  ): Promise<PoCTransactionResult>;

  /** Assemble instructions into a transaction and execute */
  executeAsTransaction(
    instructions: ActionInstruction[],
    signers?: unknown[],
  ): Promise<PoCTransactionResult>;

  /** Create an empty account with the given lamports, space, and owner */
  createAccount(
    keypair: unknown,
    lamports: number,
    space: number,
    owner: string,
  ): Promise<PoCTransactionResult>;

  /** Create a rent-exempt empty account owned by the given program */
  createAccountRentExempt(
    keypair: unknown,
    space: number,
    owner: string,
  ): Promise<PoCTransactionResult>;

  /** Create an SPL token mint */
  createTokenMint(
    mint: unknown,
    authority: string,
    freezeAuthority: string | null,
    decimals: number,
  ): Promise<PoCTransactionResult>;

  /** Mint tokens from a mint to a token account */
  mintTokens(
    mint: string,
    authority: unknown,
    account: string,
    amount: number,
  ): Promise<PoCTransactionResult>;

  /** Create a token account for the given mint */
  createTokenAccount(
    account: unknown,
    mint: string,
  ): Promise<PoCTransactionResult>;

  /** Create an Associated Token Account. Returns the ATA address. */
  createAssociatedTokenAccount(owner: string, mint: string): Promise<string>;

  /** Get or create an Associated Token Account */
  getOrCreateAssociatedTokenAccount(owner: string, mint: string): Promise<string>;

  /** Build an ActionBuilder for composing typed instructions */
  createAction(): ActionBuilder;
}

/**
 * PoC Environment for writing exploit tests against Solana programs.
 *
 * Mirrors the Neodyme poc_framework::Environment trait:
 * - payer() → config.payer
 * - execute_transaction() → executeTransaction()
 * - get_recent_blockhash() → getRecentBlockhash()
 * - get_rent_excemption() → getRentExemption()
 * - get_account() → getAccount()
 * - create_account() → createAccount()
 * - create_account_rent_excempt() → createAccountRentExempt()
 * - create_token_mint() → createTokenMint()
 * - mint_tokens() → mintTokens()
 * - create_token_account() → createTokenAccount()
 * - create_associated_token_account() → createAssociatedTokenAccount()
 */
export class PoCEnvironment implements IPoCEnvironment {
  readonly config: PoCEnvironmentConfig;
  private _connection: unknown = null;
  private _signer: SignerProvider;

  constructor(config: PoCEnvironmentConfig) {
    this.config = config;
    const payer = config.payer as {
      publicKey: { toString(): string };
      secretKey: Uint8Array;
    };
    this._signer = {
      getPublicKey: () => payer.publicKey.toString(),
      signTransaction: async (msg: Uint8Array): Promise<SignedTransaction> => {
        const web3 = await import("@solana/web3.js");
        const { Transaction, Keypair } = web3;
        const kp = Keypair.fromSecretKey(payer.secretKey);
        const tx = Transaction.from(Buffer.from(msg));
        tx.sign(kp);
        const serialized = tx.serialize();
        return {
          serialized: new Uint8Array(serialized),
          signature: tx.signature ?? new Uint8Array(64),
        };
      },
    };
  }

  /** Get the fee payer's public key */
  payer(): string {
    return this._signer.getPublicKey();
  }

  /** Lazily create a web3.js Connection */
  private async getConnection(): Promise<unknown> {
    if (this._connection) return this._connection;
    const web3 = await import("@solana/web3.js");
    const { Connection } = web3;
    this._connection = new Connection(this.config.rpcUrl, {
      commitment: this.config.commitment ?? "confirmed",
    });
    return this._connection;
  }

  /**
   * Fetch a recent blockhash for transaction construction.
   * Mirrors: Environment::get_recent_blockhash()
   */
  async getRecentBlockhash(): Promise<string> {
    const conn = await this.getConnection();
    const c = conn as { getLatestBlockhash: () => Promise<{ blockhash: string }> };
    const result = await c.getLatestBlockhash();
    return result.blockhash;
  }

  /**
   * Get rent-exempt lamports for an account of the given data size.
   * Mirrors: Environment::get_rent_excemption()
   */
  async getRentExemption(dataSize: number): Promise<number> {
    const conn = await this.getConnection();
    const c = conn as { getMinimumBalanceForRentExemption: (size: number) => Promise<number> };
    return c.getMinimumBalanceForRentExemption(dataSize);
  }

  /**
   * Fetch an account's raw data. Returns null if account doesn't exist.
   * Mirrors: Environment::get_account()
   */
  async getAccount(pubkey: string): Promise<RawAccountData | null> {
    const conn = await this.getConnection();
    const c = conn as {
      getAccountInfo: (pk: string) => Promise<{
        lamports: number;
        data: Uint8Array | { type: string; get: () => Uint8Array };
        owner: string;
        executable: boolean;
        rentEpoch: number;
      } | null>;
    };
    const info = await c.getAccountInfo(pubkey);
    if (!info) return null;
    const data =
      info.data instanceof Uint8Array
        ? info.data
        : (info.data as { get: () => Uint8Array }).get();
    return {
      pubkey,
      lamports: BigInt(info.lamports),
      data,
      owner: info.owner,
      executable: info.executable,
      rentEpoch: BigInt(info.rentEpoch),
    };
  }

  /**
   * Execute a raw transaction and wait for confirmation.
   * Mirrors: Environment::execute_transaction()
   */
  async executeTransaction(
    instructions: ActionInstruction[],
    extraSigners: unknown[] = [],
  ): Promise<PoCTransactionResult> {
    const conn = await this.getConnection();
    const web3 = await import("@solana/web3.js");
    const { Transaction, PublicKey, sendAndConfirmTransaction } = web3;

    const blockhash = await this.getRecentBlockhash();
    const payerPubkey = this.payer();

    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: new PublicKey(payerPubkey),
    });

    for (const ix of instructions) {
      tx.add({
        programId: new PublicKey(ix.programId),
        keys: ix.accounts.map((a) => ({
          pubkey: new PublicKey(a.pubkey),
          isSigner: a.isSigner,
          isWritable: a.isWritable,
        })),
        data: Buffer.from(ix.data),
      });
    }

    const allSigners = [this.config.payer, ...extraSigners];

    try {
      const sig = await sendAndConfirmTransaction(
        conn as never,
        tx,
        allSigners as never,
      );
      return {
        signature: sig,
        success: true,
      };
    } catch (err) {
      const error = err as Error & { logs?: string[] };
      return {
        signature: "",
        success: false,
        error: error.message,
        logs: error.logs,
      };
    }
  }

  /**
   * Assemble instructions into a transaction and execute.
   * Mirrors: Environment::execute_as_transaction()
   */
  async executeAsTransaction(
    instructions: ActionInstruction[],
    signers: unknown[] = [],
  ): Promise<PoCTransactionResult> {
    return this.executeTransaction(instructions, signers);
  }

  /**
   * Create an empty account with the given lamports, space, and owner.
   * Mirrors: Environment::create_account()
   */
  async createAccount(
    keypair: unknown,
    lamports: number,
    space: number,
    owner: string,
  ): Promise<PoCTransactionResult> {
    const web3 = await import("@solana/web3.js");
    const { SystemProgram, Transaction } = web3;
    const kp = keypair as { publicKey: { toString(): string } };

    const ix = SystemProgram.createAccount({
      fromPubkey: new web3.PublicKey(this.payer()),
      newAccountPubkey: new web3.PublicKey(kp.publicKey.toString()),
      lamports,
      space,
      programId: new web3.PublicKey(owner),
    });

    return this.executeTransaction(
      [
        {
          programId: ix.programId.toString(),
          accounts: ix.keys.map((k: { pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }) => ({
            pubkey: k.pubkey.toString(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: new Uint8Array(ix.data),
        },
      ],
      [keypair],
    );
  }

  /**
   * Create a rent-exempt empty account owned by the given program.
   * Mirrors: Environment::create_account_rent_excempt()
   */
  async createAccountRentExempt(
    keypair: unknown,
    space: number,
    owner: string,
  ): Promise<PoCTransactionResult> {
    const lamports = await this.getRentExemption(space);
    return this.createAccount(keypair, lamports, space, owner);
  }

  /**
   * Create an SPL token mint.
   * Mirrors: Environment::create_token_mint()
   */
  async createTokenMint(
    mint: unknown,
    authority: string,
    freezeAuthority: string | null,
    decimals: number,
  ): Promise<PoCTransactionResult> {
    const web3 = await import("@solana/web3.js");
    const spl = await import("@solana/spl-token");
    const conn = await this.getConnection();
    const mintKp = mint as { publicKey: { toString(): string }; secretKey: Uint8Array };

    const ix = await spl.createInitializeMintInstruction(
      new web3.PublicKey(mintKp.publicKey.toString()),
      decimals,
      new web3.PublicKey(authority),
      freezeAuthority ? new web3.PublicKey(freezeAuthority) : null,
    );

    // Need to create account first, then initialize mint
    const lamports = await this.getRentExemption(spl.MINT_LEN);
    const createIx = web3.SystemProgram.createAccount({
      fromPubkey: new web3.PublicKey(this.payer()),
      newAccountPubkey: new web3.PublicKey(mintKp.publicKey.toString()),
      lamports,
      space: spl.MINT_LEN,
      programId: spl.TOKEN_PROGRAM_ID,
    });

    return this.executeTransaction(
      [
        {
          programId: createIx.programId.toString(),
          accounts: createIx.keys.map((k: { pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }) => ({
            pubkey: k.pubkey.toString(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: new Uint8Array(createIx.data),
        },
        {
          programId: ix.programId.toString(),
          accounts: ix.keys.map((k: { pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }) => ({
            pubkey: k.pubkey.toString(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: new Uint8Array(ix.data),
        },
      ],
      [mint],
    );
  }

  /**
   * Mint tokens from a mint to a token account.
   * Mirrors: Environment::mint_tokens()
   */
  async mintTokens(
    mint: string,
    authority: unknown,
    account: string,
    amount: number,
  ): Promise<PoCTransactionResult> {
    const web3 = await import("@solana/web3.js");
    const spl = await import("@solana/spl-token");

    const ix = await spl.createMintToInstruction(
      new web3.PublicKey(mint),
      new web3.PublicKey(account),
      new web3.PublicKey((authority as { publicKey: { toString(): string } }).publicKey.toString()),
      amount,
    );

    return this.executeTransaction(
      [
        {
          programId: ix.programId.toString(),
          accounts: ix.keys.map((k: { pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }) => ({
            pubkey: k.pubkey.toString(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: new Uint8Array(ix.data),
        },
      ],
      [authority],
    );
  }

  /**
   * Create a token account for the given mint.
   * Mirrors: Environment::create_token_account()
   */
  async createTokenAccount(
    account: unknown,
    mint: string,
  ): Promise<PoCTransactionResult> {
    const web3 = await import("@solana/web3.js");
    const spl = await import("@solana/spl-token");

    const accountKp = account as { publicKey: { toString(): string }; secretKey: Uint8Array };
    const lamports = await this.getRentExemption(spl.ACCOUNT_LEN);

    const createIx = web3.SystemProgram.createAccount({
      fromPubkey: new web3.PublicKey(this.payer()),
      newAccountPubkey: new web3.PublicKey(accountKp.publicKey.toString()),
      lamports,
      space: spl.ACCOUNT_LEN,
      programId: spl.TOKEN_PROGRAM_ID,
    });

    const initIx = await spl.createInitializeAccountInstruction(
      new web3.PublicKey(accountKp.publicKey.toString()),
      new web3.PublicKey(mint),
      new web3.PublicKey(this.payer()),
    );

    return this.executeTransaction(
      [
        {
          programId: createIx.programId.toString(),
          accounts: createIx.keys.map((k: { pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }) => ({
            pubkey: k.pubkey.toString(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: new Uint8Array(createIx.data),
        },
        {
          programId: initIx.programId.toString(),
          accounts: initIx.keys.map((k: { pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }) => ({
            pubkey: k.pubkey.toString(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: new Uint8Array(initIx.data),
        },
      ],
      [account],
    );
  }

  /**
   * Create an Associated Token Account for the given owner and mint.
   * Mirrors: Environment::create_associated_token_account()
   * Returns the ATA address.
   */
  async createAssociatedTokenAccount(
    owner: string,
    mint: string,
  ): Promise<string> {
    const web3 = await import("@solana/web3.js");
    const spl = await import("@solana/spl-token");

    const ata = await spl.getAssociatedTokenAddress(
      new web3.PublicKey(mint),
      new web3.PublicKey(owner),
    );

    const ix = await spl.createAssociatedTokenAccountInstruction(
      new web3.PublicKey(this.payer()),
      ata,
      new web3.PublicKey(owner),
      new web3.PublicKey(mint),
    );

    await this.executeTransaction([
      {
        programId: ix.programId.toString(),
        accounts: ix.keys.map((k: { pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }) => ({
          pubkey: k.pubkey.toString(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: new Uint8Array(ix.data),
      },
    ]);

    return ata.toString();
  }

  /**
   * Get or create an Associated Token Account.
   * Mirrors: Environment::get_or_create_associated_token_account()
   */
  async getOrCreateAssociatedTokenAccount(
    owner: string,
    mint: string,
  ): Promise<string> {
    const existing = await this.getAccount(
      (
        await import("@solana/web3.js")
      ).PublicKey.findProgramAddressSync(
        [Buffer.from(owner), Buffer.from(mint)],
        new (await import("@solana/spl-token")).TOKEN_PROGRAM_ID,
      )[0].toString(),
    );

    if (existing) {
      return existing.pubkey;
    }

    return this.createAssociatedTokenAccount(owner, mint);
  }

  /**
   * Build an ActionBuilder for composing typed instructions.
   * Convenience method for ontology-aware transaction building.
   */
  createAction(): ActionBuilder {
    const builder = new ActionBuilder();
    builder.setFeePayer(this.payer());
    return builder;
  }
}
