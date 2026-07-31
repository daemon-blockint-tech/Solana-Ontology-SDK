import { describe, it, expect } from "vitest";
import { ActionBuilder } from "../src/kit/action.js";
import { OntologyClient, buildKitRpc } from "../src/kit/client.js";
import { OntologyQuery } from "../src/kit/query.js";
import { Web3jsAdapter } from "../src/web3js/adapter.js";
import { normalizeWeb3Account, web3DataToBytes } from "../src/web3js/compat.js";
import type { Concept } from "@solana-ontology/core";

const mockConcept: Concept = {
  canonicalName: "TestToken",
  purpose: "Test concept",
  category: "token",
  version: "1.0.0",
};

describe("OntologyClient", () => {
  it("should create with config", () => {
    const client = new OntologyClient({
      rpcUrl: "https://api.devnet.solana.com",
      cluster: "devnet",
    });
    expect(client.config.rpcUrl).toBe("https://api.devnet.solana.com");
    expect(client.config.cluster).toBe("devnet");
  });

  it("should register and list concepts", () => {
    const client = new OntologyClient({
      rpcUrl: "http://localhost:8899",
    });
    client.registerConcepts([mockConcept]);
    expect(client.listConcepts()).toContain("TestToken");
    expect(client.getConcept("TestToken")).toBeDefined();
    expect(client.getConcept("NonExistent")).toBeUndefined();
  });

  it("getKitClient throws before initKit", () => {
    const client = new OntologyClient({ rpcUrl: "http://localhost:8899" });
    expect(() => client.getKitClient()).toThrow(/not initialized/);
  });
});

describe("buildKitRpc (initKit RPC construction)", () => {
  const RPC_URL = "https://api.devnet.solana.com";

  it("builds an RPC via Kit's createSolanaRpc factory", () => {
    let seenUrl: string | undefined;
    const fakeRpc = { getSlot: () => ({ send: async () => 1n }) };
    const kit = {
      createSolanaRpc: (url: string) => {
        seenUrl = url;
        return fakeRpc;
      },
    };
    const rpc = buildKitRpc(kit, RPC_URL);
    expect(seenUrl).toBe(RPC_URL);
    expect(rpc).toBe(fakeRpc);
  });

  it("falls back to createRpc + transport composition when createSolanaRpc is absent", () => {
    const calls: Record<string, unknown> = {};
    const fakeRpc = { getSlot: () => ({ send: async () => 2n }) };
    const kit = {
      createSolanaRpcApi: () => ({ __api: true }),
      createDefaultRpcTransport: (cfg: { url: string }) => {
        calls.transportUrl = cfg.url;
        return { __transport: true };
      },
      createRpc: (cfg: { api: unknown; transport: unknown }) => {
        calls.rpcConfig = cfg;
        return fakeRpc;
      },
    };
    const rpc = buildKitRpc(kit, RPC_URL);
    expect(calls.transportUrl).toBe(RPC_URL);
    expect(calls.rpcConfig).toEqual({ api: { __api: true }, transport: { __transport: true } });
    expect(rpc).toBe(fakeRpc);
  });

  it("throws an explicit error when the installed Kit exposes no known factory", () => {
    expect(() => buildKitRpc({ somethingElse: () => {} }, RPC_URL)).toThrow(
      /does not expose createSolanaRpc/,
    );
  });
});

describe("ActionBuilder", () => {
  it("should build instructions", () => {
    const builder = new ActionBuilder();
    builder
      .setFeePayer("11111111111111111111111111111111")
      .setComputeUnitLimit(200000)
      .addInstruction({
        programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        accounts: [
          { pubkey: "11111111111111111111111111111111", isSigner: true, isWritable: true },
        ],
        data: new Uint8Array([1, 2, 3]),
      });

    const ixs = builder.build();
    // 1 compute budget instruction + 1 custom
    expect(ixs.length).toBe(2);
    expect(builder.feePayer).toBe("11111111111111111111111111111111");
  });

  it("should build without compute budget if not set", () => {
    const builder = new ActionBuilder();
    builder.addInstruction({
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      accounts: [],
      data: new Uint8Array([1]),
    });
    const ixs = builder.build();
    expect(ixs.length).toBe(1);
  });
});

describe("OntologyQuery", () => {
  it("should register and retrieve queries", () => {
    const q = new OntologyQuery();
    const decoder = (data: Uint8Array) => ({ raw: data });
    q.register("TestToken", {}, decoder);
    expect(q.list()).toContain("TestToken");
    expect(q.get("TestToken")).toBeDefined();
    expect(q.get("NonExistent")).toBeUndefined();
  });
});

describe("Web3jsAdapter", () => {
  it("should create with config", () => {
    const adapter = new Web3jsAdapter({
      rpcUrl: "https://api.devnet.solana.com",
    });
    expect(adapter.config.rpcUrl).toBe("https://api.devnet.solana.com");
  });

  it("should throw if not initialized", () => {
    const adapter = new Web3jsAdapter({
      rpcUrl: "https://api.devnet.solana.com",
    });
    expect(() => adapter.connection).toThrow("not initialized");
  });
});

describe("compat", () => {
  it("should convert Buffer to Uint8Array", () => {
    const buf = Buffer.from([1, 2, 3]);
    const bytes = web3DataToBytes(buf);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(3);
  });

  it("should normalize web3 account info", () => {
    const normalized = normalizeWeb3Account("TestPubkey", {
      lamports: 1000000000,
      data: Buffer.from([1, 2, 3]),
      owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      executable: false,
      rentEpoch: 0,
    });
    expect(normalized.pubkey).toBe("TestPubkey");
    expect(normalized.lamports).toBe(1000000000n);
    expect(normalized.data).toBeInstanceOf(Uint8Array);
    expect(normalized.executable).toBe(false);
  });
});
