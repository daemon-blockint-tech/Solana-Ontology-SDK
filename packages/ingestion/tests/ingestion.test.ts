import { describe, it, expect } from "vitest";
import {
  YellowstoneClient,
  StateManager,
  EventProcessor,
  NullProducer,
  type AccountUpdateEvent,
  type TransactionEvent,
} from "../src/index.js";

describe("ingestion", () => {
  describe("YellowstoneClient", () => {
    it("should create with config", () => {
      const client = new YellowstoneClient({
        endpoint: "http://localhost:10000",
      });
      expect(client.isConnected()).toBe(false);
    });

    it("should connect and disconnect", async () => {
      const client = new YellowstoneClient({
        endpoint: "http://localhost:10000",
      });
      await client.connect();
      expect(client.isConnected()).toBe(true);
      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it("should emit account updates to registered callbacks", async () => {
      const client = new YellowstoneClient({
        endpoint: "http://localhost:10000",
      });
      await client.connect();

      let received: AccountUpdateEvent | null = null;
      client.onAccountUpdate((event) => {
        received = event;
      });

      const mockEvent: AccountUpdateEvent = {
        pubkey: "Test1111111111111111111111111111111111111",
        lamports: 1000,
        owner: "Owner11111111111111111111111111111111111111",
        data: new Uint8Array([1, 2, 3]),
        executable: false,
        rentEpoch: 0,
        slot: 100,
        commitment: "processed",
        previousData: null,
      };

      client.emitAccountUpdate(mockEvent);
      expect(received).not.toBeNull();
      expect(received!.pubkey).toBe("Test1111111111111111111111111111111111111");
    });

    it("should throw if subscribe called before connect", () => {
      const client = new YellowstoneClient({
        endpoint: "http://localhost:10000",
      });
      expect(() => client.subscribe({})).toThrow("Not connected");
    });
  });

  describe("StateManager", () => {
    it("should process account updates", () => {
      const manager = new StateManager();
      const event: AccountUpdateEvent = {
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 5000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([1, 2, 3, 4]),
        executable: false,
        rentEpoch: 0,
        slot: 42,
        commitment: "confirmed",
        previousData: null,
      };

      const state = manager.processAccountUpdate(event);
      expect(state.pubkey).toBe("Acct111111111111111111111111111111111111111");
      expect(state.lamports).toBe(5000);
      expect(manager.getAccountCount()).toBe(1);
      expect(manager.getCurrentSlot()).toBe(42);
    });

    it("should upsert account state (only latest)", () => {
      const manager = new StateManager();
      const pubkey = "Acct111111111111111111111111111111111111111";

      manager.processAccountUpdate({
        pubkey,
        lamports: 1000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([1]),
        executable: false,
        rentEpoch: 0,
        slot: 10,
        commitment: "processed",
        previousData: null,
      });

      manager.processAccountUpdate({
        pubkey,
        lamports: 2000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([2]),
        executable: false,
        rentEpoch: 0,
        slot: 11,
        commitment: "confirmed",
        previousData: null,
      });

      const state = manager.getAccountState(pubkey);
      expect(state?.lamports).toBe(2000); // Latest state
      expect(state?.slot).toBe(11);
      expect(manager.getAccountCount()).toBe(1); // Not duplicated
    });

    it("should process transactions and track pending", () => {
      const manager = new StateManager();
      const event: TransactionEvent = {
        signature: "sig123",
        slot: 100,
        commitment: "confirmed",
        fee: 5000,
        logs: [],
        writableAccounts: ["Acct111111111111111111111111111111111111111"],
        readonlyAccounts: [],
        error: null,
      };

      manager.processTransaction(event);
      expect(manager.getPendingTransactions()).toHaveLength(1);

      // Finalize the transaction
      manager.processTransaction({ ...event, commitment: "finalized" });
      expect(manager.getPendingTransactions()).toHaveLength(0);
    });

    it("should handle reorg by rolling back state", () => {
      const manager = new StateManager();

      // Write accounts at slots 10, 11, 12
      for (let slot = 10; slot <= 12; slot++) {
        manager.processAccountUpdate({
          pubkey: `Acct${slot.toString().padStart(43, "1")}`,
          lamports: slot * 1000,
          owner: "Prog111111111111111111111111111111111111111",
          data: new Uint8Array([slot]),
          executable: false,
          rentEpoch: 0,
          slot,
          commitment: "confirmed",
          previousData: null,
        });
      }

      expect(manager.getAccountCount()).toBe(3);
      expect(manager.getCurrentSlot()).toBe(12);

      // Reorg drops slot 11 and 12
      const result = manager.handleReorg(11);
      expect(result.affectedAccounts.length).toBe(2);
      expect(manager.getAccountCount()).toBe(1); // Only slot 10 remains
      expect(manager.getCurrentSlot()).toBe(10);
    });

    it("should snapshot and restore state", () => {
      const manager = new StateManager();
      manager.processAccountUpdate({
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 1000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([1, 2, 3]),
        executable: false,
        rentEpoch: 0,
        slot: 50,
        commitment: "confirmed",
        previousData: null,
      });

      const snapshot = manager.snapshot();
      expect(snapshot.accounts).toHaveLength(1);
      expect(snapshot.slot).toBe(50);

      // Clear and restore
      manager.clear();
      expect(manager.getAccountCount()).toBe(0);
      manager.restore(snapshot);
      expect(manager.getAccountCount()).toBe(1);
      expect(manager.getCurrentSlot()).toBe(50);
    });

    it("should filter accounts by owner", () => {
      const manager = new StateManager();
      manager.processAccountUpdate({
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 1000,
        owner: "OwnerA111111111111111111111111111111111111111",
        data: new Uint8Array([1]),
        executable: false,
        rentEpoch: 0,
        slot: 10,
        commitment: "confirmed",
        previousData: null,
      });
      manager.processAccountUpdate({
        pubkey: "Acct21111111111111111111111111111111111111111",
        lamports: 2000,
        owner: "OwnerB111111111111111111111111111111111111111",
        data: new Uint8Array([2]),
        executable: false,
        rentEpoch: 0,
        slot: 11,
        commitment: "confirmed",
        previousData: null,
      });

      const ownerAAccounts = manager.getAccountsByOwner(
        "OwnerA111111111111111111111111111111111111111",
      );
      expect(ownerAAccounts).toHaveLength(1);
      expect(ownerAAccounts[0].lamports).toBe(1000);
    });
  });

  describe("EventProcessor", () => {
    it("should process events without decoder", () => {
      const processor = new EventProcessor();
      const event: AccountUpdateEvent = {
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 1000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([1, 2, 3]),
        executable: false,
        rentEpoch: 0,
        slot: 100,
        commitment: "confirmed",
        previousData: null,
      };

      const result = processor.processAccountUpdate(event);
      expect(result).not.toBeNull();
      expect(result!.pubkey).toBe("Acct111111111111111111111111111111111111111");
      expect(result!.decoded).toEqual({});
    });

    it("should decode with registered decoder", () => {
      const processor = new EventProcessor();
      processor.registerDecoder("Prog111111111111111111111111111111111111111", (data) => {
        return { amount: Number(new DataView(data.buffer).getBigUint64(0, true)) };
      });

      const data = new Uint8Array(8);
      new DataView(data.buffer).setBigUint64(0, 9999n, true);

      const result = processor.processAccountUpdate({
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 1000,
        owner: "Prog111111111111111111111111111111111111111",
        data,
        executable: false,
        rentEpoch: 0,
        slot: 100,
        commitment: "confirmed",
        previousData: null,
      });

      expect(result!.decoded.amount).toBe(9999);
    });

    it("should emit decoded accounts to callbacks", () => {
      const processor = new EventProcessor();
      let received: unknown = null;
      processor.onDecodedAccount((account) => {
        received = account;
      });

      processor.processAccountUpdate({
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 1000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([1]),
        executable: false,
        rentEpoch: 0,
        slot: 100,
        commitment: "confirmed",
        previousData: null,
      });

      expect(received).not.toBeNull();
    });
  });

  describe("NullProducer", () => {
    it("should be a no-op", async () => {
      const producer = new NullProducer();
      await producer.publishAccountUpdate({} as AccountUpdateEvent);
      await producer.publishTransaction({} as TransactionEvent);
      await producer.flush();
      await producer.close();
    });
  });
});
