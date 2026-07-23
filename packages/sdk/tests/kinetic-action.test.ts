import { describe, it, expect } from "vitest";
import {
  ActionBuilder,
  TransactionEventEmitter,
  ConfirmationTracker,
  BlockhashCache,
  encodeBorshValue,
  encodeInstructionData,
  resolveAccounts,
  compileInstruction,
  type IdlInstructionDef,
} from "../src/index.js";

describe("Kinetic Action Layer", () => {
  describe("TransactionEventEmitter", () => {
    it("should emit and receive events", () => {
      const emitter = new TransactionEventEmitter();
      let received: unknown = null;
      emitter.on("dispatched", (data) => {
        received = data;
      });
      emitter.emit("dispatched", { signature: "abc123" });
      expect(received).toEqual({ signature: "abc123" });
    });

    it("should handle listener removal", () => {
      const emitter = new TransactionEventEmitter();
      let count = 0;
      const listener = () => {
        count++;
      };
      emitter.on("confirmed", listener);
      emitter.emit("confirmed");
      emitter.off("confirmed", listener);
      emitter.emit("confirmed");
      expect(count).toBe(1);
    });
  });

  describe("BlockhashCache", () => {
    it("should cache blockhash within TTL", async () => {
      let callCount = 0;
      const cache = new BlockhashCache(async () => {
        callCount++;
        return {
          blockhash: "test-hash",
          lastValidBlockHeight: 100,
          fetchedAt: Date.now(),
        };
      }, 10_000);

      await cache.getBlockhash();
      await cache.getBlockhash();
      expect(callCount).toBe(1);
    });

    it("should refetch after TTL expires", async () => {
      let callCount = 0;
      const cache = new BlockhashCache(async () => {
        callCount++;
        return {
          blockhash: "test-hash",
          lastValidBlockHeight: 100,
          fetchedAt: Date.now(),
        };
      }, 50); // 50ms TTL

      await cache.getBlockhash();
      await new Promise((r) => setTimeout(r, 60));
      await cache.getBlockhash();
      expect(callCount).toBe(2);
    });

    it("should invalidate cache", async () => {
      let callCount = 0;
      const cache = new BlockhashCache(async () => {
        callCount++;
        return {
          blockhash: "test-hash",
          lastValidBlockHeight: 100,
          fetchedAt: Date.now(),
        };
      });

      await cache.getBlockhash();
      cache.invalidate();
      await cache.getBlockhash();
      expect(callCount).toBe(2);
    });
  });

  describe("ConfirmationTracker", () => {
    it("should track pending transactions", () => {
      const tracker = new ConfirmationTracker();
      const entry = tracker.track("sig123");
      expect(entry.signature).toBe("sig123");
      expect(entry.status).toBe("pending");
      expect(tracker.getStatus("sig123")).toBe("pending");
    });

    it("should list pending transactions", () => {
      const tracker = new ConfirmationTracker();
      tracker.track("sig1");
      tracker.track("sig2");
      expect(tracker.getPending()).toHaveLength(2);
    });

    it("should forget transactions", () => {
      const tracker = new ConfirmationTracker();
      tracker.track("sig1");
      tracker.forget("sig1");
      expect(tracker.getStatus("sig1")).toBeUndefined();
    });
  });

  describe("Borsh encoding", () => {
    it("should encode u8", () => {
      expect(encodeBorshValue("u8", 255)).toEqual(new Uint8Array([255]));
    });

    it("should encode u32", () => {
      const result = encodeBorshValue("u32", 1000);
      const view = new DataView(result.buffer);
      expect(view.getUint32(0, true)).toBe(1000);
    });

    it("should encode u64", () => {
      const result = encodeBorshValue("u64", 1000000n);
      const view = new DataView(result.buffer);
      expect(view.getBigUint64(0, true)).toBe(1000000n);
    });

    it("should encode bool", () => {
      expect(encodeBorshValue("bool", true)).toEqual(new Uint8Array([1]));
      expect(encodeBorshValue("bool", false)).toEqual(new Uint8Array([0]));
    });

    it("should encode string with length prefix", () => {
      const result = encodeBorshValue("string", "hello");
      const view = new DataView(result.buffer);
      expect(view.getUint32(0, true)).toBe(5); // length
      expect(new TextDecoder().decode(result.subarray(4))).toBe("hello");
    });
  });

  describe("instruction compiler", () => {
    it("should resolve accounts from IDL definition", () => {
      const accounts = resolveAccounts(
        [
          { name: "authority", writable: false, signer: true },
          { name: "mint", writable: true, signer: false },
        ],
        {
          authority: "Auth1111111111111111111111111111111111111",
          mint: "Mint111111111111111111111111111111111111111",
        },
      );
      expect(accounts).toHaveLength(2);
      expect(accounts[0].isSigner).toBe(true);
      expect(accounts[1].isWritable).toBe(true);
    });

    it("should throw on missing account", () => {
      expect(() =>
        resolveAccounts([{ name: "authority", writable: false, signer: true }], {}),
      ).toThrow("Missing required account: authority");
    });

    it("should encode instruction data with discriminator", () => {
      const data = encodeInstructionData(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [{ name: "amount", type: "u64" }],
        { amount: 1000n },
      );
      expect(data[0]).toBe(1); // discriminator byte 0
      expect(data.length).toBe(16); // 8 disc + 8 u64
    });

    it("should compile full instruction", () => {
      const def: IdlInstructionDef = {
        name: "initialize_mint",
        discriminator: [24, 77, 231, 94, 77, 226, 46, 173],
        accounts: [
          { name: "mint", writable: true, signer: false },
          { name: "authority", writable: false, signer: true },
        ],
        args: [{ name: "decimals", type: "u8" }],
      };

      const ix = compileInstruction(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        def,
        { decimals: 9 },
        {
          mint: "Mint111111111111111111111111111111111111111",
          authority: "Auth1111111111111111111111111111111111111",
        },
      );

      expect(ix.programId).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      expect(ix.accounts).toHaveLength(2);
      expect(ix.data[0]).toBe(24); // discriminator
    });
  });
});
