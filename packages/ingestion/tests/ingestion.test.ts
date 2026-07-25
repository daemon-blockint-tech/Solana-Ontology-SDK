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

    it("should handle reorg by restoring previous state", () => {
      const manager = new StateManager();

      // Write account at slot 10
      manager.processAccountUpdate({
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 1000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([10]),
        executable: false,
        rentEpoch: 0,
        slot: 10,
        commitment: "confirmed",
        previousData: null,
      });

      // Update same account at slot 11 (overwrites slot 10 state)
      manager.processAccountUpdate({
        pubkey: "Acct111111111111111111111111111111111111111",
        lamports: 2000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([11]),
        executable: false,
        rentEpoch: 0,
        slot: 11,
        commitment: "confirmed",
        previousData: null,
      });

      // Write a new account at slot 12 (didn't exist before)
      manager.processAccountUpdate({
        pubkey: "Acct22211111111111111111111111111111111111111",
        lamports: 3000,
        owner: "Prog111111111111111111111111111111111111111",
        data: new Uint8Array([12]),
        executable: false,
        rentEpoch: 0,
        slot: 12,
        commitment: "confirmed",
        previousData: null,
      });

      expect(manager.getAccountCount()).toBe(2);
      expect(manager.getCurrentSlot()).toBe(12);

      // Reorg drops slot 11 and 12
      const result = manager.handleReorg(11);
      expect(result.affectedAccounts.length).toBe(2);
      expect(manager.getAccountCount()).toBe(1); // Only Acct1 remains

      // Acct1 should be restored to its slot 10 state, not deleted
      const restored = manager.getAccountState("Acct111111111111111111111111111111111111111");
      expect(restored).toBeDefined();
      expect(restored!.lamports).toBe(1000); // Restored to slot 10 value, not slot 11
      expect(restored!.data).toEqual(new Uint8Array([10]));
      expect(restored!.slot).toBe(10);

      // Acct2 should be gone (didn't exist before slot 12)
      expect(
        manager.getAccountState("Acct22211111111111111111111111111111111111111"),
      ).toBeUndefined();

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

describe("StateManager instrumentation", () => {
  const acct = (over: Partial<AccountUpdateEvent> = {}): AccountUpdateEvent => ({
    pubkey: "Acc11111111111111111111111111111111111111",
    lamports: 1000,
    owner: "Own11111111111111111111111111111111111111",
    data: new Uint8Array([1, 2, 3]),
    executable: false,
    rentEpoch: 0,
    slot: 100,
    commitment: "processed",
    previousData: null,
    ...over,
  });

  it("bumps a monotonic version and counts real updates", () => {
    const sm = new StateManager();
    expect(sm.getVersion()).toBe(0);
    sm.processAccountUpdate(acct());
    sm.processAccountUpdate(acct({ pubkey: "Acc22222222222222222222222222222222222222" }));
    const s = sm.stats();
    expect(s.version).toBe(2);
    expect(s.accountUpdates).toBe(2);
    expect(s.accounts).toBe(2);
  });

  it("treats a replayed identical event as an idempotent no-op", () => {
    const sm = new StateManager();
    sm.processAccountUpdate(acct());
    const v1 = sm.getVersion();
    sm.processAccountUpdate(acct()); // identical → no-op
    const s = sm.stats();
    expect(s.idempotentUpdates).toBe(1);
    expect(s.accountUpdates).toBe(1); // second was not a real update
    expect(sm.getVersion()).toBe(v1); // no version bump on a no-op
  });

  it("counts reorgs, bumps version, and tracks pending tx as a gauge", () => {
    const sm = new StateManager();
    sm.processAccountUpdate(acct({ slot: 100 }));
    sm.processAccountUpdate(
      acct({ pubkey: "Acc33333333333333333333333333333333333333", slot: 101 }),
    );
    sm.processTransaction({
      signature: "Sig1",
      slot: 101,
      commitment: "processed",
    } as TransactionEvent);
    expect(sm.stats().pendingTx).toBe(1);

    const vBefore = sm.getVersion();
    const result = sm.handleReorg(101); // drop slot >= 101
    const s = sm.stats();
    expect(s.reorgs).toBe(1);
    expect(result.affectedAccounts.length).toBeGreaterThan(0);
    expect(sm.getVersion()).toBeGreaterThan(vBefore);
    expect(s.pendingTx).toBe(0); // reorged tx dropped

    // Metrics render as Prometheus text wired to real counters.
    const prom = sm.renderProm();
    expect(prom).toContain("# TYPE state_reorgs_total counter");
    expect(prom).toContain("# TYPE state_version gauge");
  });
});
