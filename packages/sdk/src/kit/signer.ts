/**
 * Abstract signing provider interface.
 * Supports local keypair (dev), KMS (production), and MPC wallets (enterprise).
 */

export interface SignedTransaction {
  /** Serialized signed transaction bytes */
  serialized: Uint8Array;
  /** Transaction signature */
  signature: Uint8Array;
}

export interface SignerProvider {
  /** Get the public key of the signer */
  getPublicKey(): string;

  /** Sign a serialized transaction message */
  signTransaction(messageBytes: Uint8Array): Promise<SignedTransaction>;
}

/**
 * Local keypair signer (development only).
 * Uses @solana/web3.js Keypair under the hood.
 */
export class KeypairSigner implements SignerProvider {
  private keypair: unknown;
  private publicKey: string;

  constructor(keypair: unknown) {
    this.keypair = keypair;
    const kp = keypair as { publicKey: { toString(): string } };
    this.publicKey = kp.publicKey.toString();
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  async signTransaction(messageBytes: Uint8Array): Promise<SignedTransaction> {
    const web3 = await import("@solana/web3.js");
    const { Transaction, Keypair } = web3;
    const kp = this.keypair as { secretKey: Uint8Array; publicKey: Uint8Array };

    // Reconstruct the transaction from message bytes, sign it, and serialize
    const tx = Transaction.from(Buffer.from(messageBytes));
    const keypair = Keypair.fromSecretKey(kp.secretKey);
    tx.sign(keypair);

    const serialized = tx.serialize();
    if (!tx.signature) {
      throw new Error("Transaction signing failed: no signature produced");
    }
    return { serialized: new Uint8Array(serialized), signature: tx.signature };
  }
}

/**
 * AWS KMS / GCP KMS signing adapter.
 * Calls an external KMS service to sign the transaction.
 */
export class KmsSigner implements SignerProvider {
  private publicKey: string;
  private kmsClient: unknown;
  private keyId: string;

  constructor(config: { publicKey: string; kmsClient: unknown; keyId: string }) {
    this.publicKey = config.publicKey;
    this.kmsClient = config.kmsClient;
    this.keyId = config.keyId;
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  async signTransaction(messageBytes: Uint8Array): Promise<SignedTransaction> {
    const web3 = await import("@solana/web3.js");
    const { Transaction } = web3;

    // KMS signing: send message bytes to KMS, get back Ed25519 signature
    const client = this.kmsClient as {
      sign: (params: { keyId: string; message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
    };
    const result = await client.sign({ keyId: this.keyId, message: messageBytes });

    // Reconstruct the transaction and attach the KMS signature
    const tx = Transaction.from(Buffer.from(messageBytes));
    tx.addSignature(
      new (web3.PublicKey)(this.publicKey),
      Buffer.from(result.signature),
    );

    const serialized = tx.serialize();
    return { serialized: new Uint8Array(serialized), signature: result.signature };
  }
}

/**
 * MPC (Multi-Party Computation) wallet signing via webhook.
 * The private key is split across multiple parties — no single party holds the full key.
 */
export class MpcSigner implements SignerProvider {
  private publicKey: string;
  private webhookUrl: string;
  private authToken: string;

  constructor(config: { publicKey: string; webhookUrl: string; authToken: string }) {
    this.publicKey = config.publicKey;
    this.webhookUrl = config.webhookUrl;
    this.authToken = config.authToken;
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  async signTransaction(messageBytes: Uint8Array): Promise<SignedTransaction> {
    // MPC signing: POST message bytes to MPC service webhook
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({
        message: Array.from(messageBytes),
        publicKey: this.publicKey,
      }),
    });
    if (!response.ok) {
      throw new Error(`MPC signing failed: ${response.status} ${response.statusText}`);
    }
    const result = (await response.json()) as { signature: number[] };
    const signature = new Uint8Array(result.signature);

    // Reconstruct the transaction and attach the MPC signature
    const web3 = await import("@solana/web3.js");
    const { Transaction } = web3;
    const tx = Transaction.from(Buffer.from(messageBytes));
    tx.addSignature(new web3.PublicKey(this.publicKey), Buffer.from(signature));
    const serialized = tx.serialize();

    return { serialized: new Uint8Array(serialized), signature };
  }
}
