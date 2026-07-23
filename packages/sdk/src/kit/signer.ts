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
    const kp = this.keypair as { secretKey: Uint8Array };
    // web3.js exports nacl.sign via the default export
    const nacl = (
      web3 as unknown as { nacl: { sign: (msg: Uint8Array, sk: Uint8Array) => Uint8Array } }
    ).nacl;
    const signature = nacl.sign(messageBytes, kp.secretKey);
    return { serialized: messageBytes, signature };
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
    // KMS signing: send message bytes to KMS, get back Ed25519 signature
    // This is a stub — actual KMS integration depends on the provider SDK
    const client = this.kmsClient as {
      sign: (params: { keyId: string; message: Uint8Array }) => Promise<{ signature: Uint8Array }>;
    };
    const result = await client.sign({ keyId: this.keyId, message: messageBytes });
    return { serialized: messageBytes, signature: result.signature };
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
    return {
      serialized: messageBytes,
      signature: new Uint8Array(result.signature),
    };
  }
}
