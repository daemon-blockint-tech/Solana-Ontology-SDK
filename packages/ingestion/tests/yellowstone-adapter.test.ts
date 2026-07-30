import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  YellowstoneStreamAdapter,
  StateManager,
  encodeBase58,
  type RawSubscribeStream,
  type RawSubscribeUpdate,
} from "../src/index.js";

class FakeStream implements RawSubscribeStream {
  handlers = new Map<string, ((arg?: unknown) => void)[]>();
  written: unknown[] = [];
  cancelled = false;

  on(event: string, cb: (arg?: unknown) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
    return this;
  }
  write(request: unknown): void {
    this.written.push(request);
  }
  cancel(): void {
    this.cancelled = true;
  }
  fire(event: string, arg?: unknown): void {
    for (const cb of this.handlers.get(event) ?? []) cb(arg);
  }
  data(update: RawSubscribeUpdate): void {
    this.fire("data", update);
  }
}

function makeFactory() {
  const streams: FakeStream[] = [];
  let connectAttempts = 0;
  const factory = () => {
    connectAttempts++;
    const stream = new FakeStream();
    streams.push(stream);
    return { subscribe: () => stream };
  };
  return { factory, streams, attempts: () => connectAttempts };
}

const PUBKEY_BYTES = new Uint8Array(32).fill(7);
const OWNER_BYTES = new Uint8Array(32).fill(9);

describe("YellowstoneStreamAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects, applies filters, and translates account updates", async () => {
    const { factory, streams } = makeFactory();
    const adapter = new YellowstoneStreamAdapter(factory, { commitment: "confirmed" });
    const events: unknown[] = [];
    adapter.onAccountUpdate((e) => events.push(e));
    adapter.subscribe({ programIds: ["Prog111111111111111111111111111111111111111"] });

    await adapter.start();
    expect(adapter.status).toBe("connected");
    expect(streams[0].written).toHaveLength(1);

    streams[0].data({
      account: {
        slot: "42",
        account: {
          pubkey: PUBKEY_BYTES,
          lamports: "5000",
          owner: OWNER_BYTES,
          data: new Uint8Array([1, 2, 3]),
          executable: false,
          rentEpoch: 0,
        },
      },
    });

    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(event.pubkey).toBe(encodeBase58(PUBKEY_BYTES));
    expect(event.lamports).toBe(5000);
    expect(event.slot).toBe(42);
    expect(event.commitment).toBe("confirmed");
  });

  it("reconnects with backoff and resubscribes filters after a stream error", async () => {
    const { factory, streams, attempts } = makeFactory();
    const adapter = new YellowstoneStreamAdapter(factory, { reconnectIntervalMs: 100 });
    const errors: Error[] = [];
    adapter.onError((e) => errors.push(e));
    adapter.subscribe({ accounts: ["A"] });
    adapter.subscribe({ accounts: ["B"] });

    await adapter.start();
    expect(attempts()).toBe(1);
    expect(streams[0].written).toHaveLength(2);

    streams[0].fire("error", new Error("stream broke"));
    expect(adapter.status).toBe("reconnecting");
    expect(errors[0].message).toBe("stream broke");

    await vi.advanceTimersByTimeAsync(100);
    expect(attempts()).toBe(2);
    // Both filters re-applied on the fresh stream
    expect(streams[1].written).toHaveLength(2);
    expect(adapter.status).toBe("connected");
  });

  it("doubles the backoff per attempt and gives up after maxReconnects", async () => {
    const { factory, streams } = makeFactory();
    const adapter = new YellowstoneStreamAdapter(factory, {
      reconnectIntervalMs: 100,
      maxReconnects: 2,
    });
    const errors: Error[] = [];
    adapter.onError((e) => errors.push(e));

    await adapter.start();
    streams[0].fire("end");
    await vi.advanceTimersByTimeAsync(100); // attempt 1
    streams[1].fire("end");
    await vi.advanceTimersByTimeAsync(199); // attempt 2 waits 200ms
    expect(streams).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(streams).toHaveLength(3);

    streams[2].fire("end"); // exhausted
    expect(adapter.status).toBe("stopped");
    expect(errors.at(-1)!.message).toContain("reconnect attempts exhausted");
  });

  it("a healthy data message resets the backoff counter", async () => {
    const { factory, streams } = makeFactory();
    const adapter = new YellowstoneStreamAdapter(factory, {
      reconnectIntervalMs: 100,
      maxReconnects: 1,
    });
    adapter.onError(() => {});
    await adapter.start();

    streams[0].fire("end");
    await vi.advanceTimersByTimeAsync(100);
    // Reconnected (used the single allowed attempt), then data flows again
    streams[1].data({ slot: { slot: 1 } });
    expect(adapter.status).toBe("connected");

    // Because the counter reset, another drop still reconnects
    streams[1].fire("end");
    await vi.advanceTimersByTimeAsync(100);
    expect(streams).toHaveLength(3);
  });

  it("stop() cancels the stream and disables reconnects", async () => {
    const { factory, streams } = makeFactory();
    const adapter = new YellowstoneStreamAdapter(factory);
    await adapter.start();

    adapter.stop();
    expect(streams[0].cancelled).toBe(true);
    streams[0].fire("end");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(streams).toHaveLength(1);
    expect(adapter.status).toBe("stopped");
  });

  it("surfaces consumer callback errors without killing the stream", async () => {
    const { factory, streams } = makeFactory();
    const adapter = new YellowstoneStreamAdapter(factory);
    const errors: Error[] = [];
    adapter.onError((e) => errors.push(e));
    adapter.onSlotUpdate(() => {
      throw new Error("consumer exploded");
    });

    await adapter.start();
    streams[0].data({ slot: { slot: 10 } });
    expect(errors[0].message).toBe("consumer exploded");
    expect(adapter.status).toBe("connected");
  });

  it("drives StateManager finalization from finalized slot updates", async () => {
    const { factory, streams } = makeFactory();
    const manager = new StateManager();
    const adapter = new YellowstoneStreamAdapter(factory, { commitment: "processed" });
    adapter.onAccountUpdate((e) => manager.processAccountUpdate(e));
    adapter.onFinalizedSlot((slot) => manager.markFinalized(slot));

    await adapter.start();
    for (let slot = 1; slot <= 5; slot++) {
      streams[0].data({
        account: {
          slot,
          account: {
            pubkey: PUBKEY_BYTES,
            lamports: slot,
            owner: OWNER_BYTES,
            data: new Uint8Array([slot]),
            executable: false,
            rentEpoch: 0,
          },
        },
      });
    }
    expect(manager.stats().trackedSlots).toBe(5);

    streams[0].data({ slot: { slot: 4, status: 2 } });
    expect(manager.getFinalizedSlot()).toBe(4);
    expect(manager.stats().trackedSlots).toBe(1);
  });

  it("translates transaction updates including errors", async () => {
    const { factory, streams } = makeFactory();
    const adapter = new YellowstoneStreamAdapter(factory);
    const events: unknown[] = [];
    adapter.onTransaction((e) => events.push(e));
    await adapter.start();

    const sig = new Uint8Array(64).fill(3);
    streams[0].data({
      transaction: {
        slot: 99,
        transaction: {
          signature: sig,
          meta: { fee: "5000", logMessages: ["log1"], err: { InstructionError: [0, "Custom"] } },
        },
      },
    });

    const event = events[0] as Record<string, unknown>;
    expect(event.signature).toBe(encodeBase58(sig));
    expect(event.fee).toBe(5000);
    expect(event.logs).toEqual(["log1"]);
    expect(event.error).toContain("InstructionError");
  });
});
