/**
 * Optional message broker producer for pushing events to Kafka/Redis Streams.
 * Interface-based — NullProducer for local dev, inject real producer at runtime.
 */

import type { AccountUpdateEvent, TransactionEvent } from "./types.js";

export interface MessageProducer {
  /** Push an account update event to the message broker */
  publishAccountUpdate(event: AccountUpdateEvent): Promise<void>;
  /** Push a transaction event to the message broker */
  publishTransaction(event: TransactionEvent): Promise<void>;
  /** Flush pending messages */
  flush(): Promise<void>;
  /** Close the producer connection */
  close(): Promise<void>;
}

/**
 * No-op producer for local development and testing.
 */
export class NullProducer implements MessageProducer {
  async publishAccountUpdate(_event: AccountUpdateEvent): Promise<void> {}
  async publishTransaction(_event: TransactionEvent): Promise<void> {}
  async flush(): Promise<void> {}
  async close(): Promise<void> {}
}

/**
 * Kafka producer stub — inject a real Kafka client at runtime.
 */
export class KafkaProducer implements MessageProducer {
  private client: unknown;
  private topic: string;

  constructor(config: { client: unknown; topic: string }) {
    this.client = config.client;
    this.topic = config.topic;
  }

  async publishAccountUpdate(event: AccountUpdateEvent): Promise<void> {
    const client = this.client as {
      send?: (topic: string, message: unknown) => Promise<void>;
    };
    if (client.send) {
      await client.send(this.topic, {
        type: "account_update",
        pubkey: event.pubkey,
        slot: event.slot,
        commitment: event.commitment,
        data: Array.from(event.data),
      });
    }
  }

  async publishTransaction(event: TransactionEvent): Promise<void> {
    const client = this.client as {
      send?: (topic: string, message: unknown) => Promise<void>;
    };
    if (client.send) {
      await client.send(this.topic, {
        type: "transaction",
        signature: event.signature,
        slot: event.slot,
        commitment: event.commitment,
      });
    }
  }

  async flush(): Promise<void> {
    const client = this.client as { flush?: () => Promise<void> };
    if (client.flush) await client.flush();
  }

  async close(): Promise<void> {
    const client = this.client as { close?: () => Promise<void> };
    if (client.close) await client.close();
  }
}
