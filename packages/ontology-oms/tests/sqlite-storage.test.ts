import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SqliteStorage,
  type ObjectTypeDefinition,
  type LinkTypeDefinition,
  type ActionTypeDefinition,
} from "../src/index.js";

const tempDirs: string[] = [];

function newStorage(): SqliteStorage {
  const dir = mkdtempSync(join(tmpdir(), "oms-sqlite-"));
  tempDirs.push(dir);
  return new SqliteStorage(join(dir, "oms.db"));
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const objectType: ObjectTypeDefinition = {
  name: "TokenMint",
  primaryKey: "pubkey",
  properties: [
    { name: "pubkey", type: "String", required: true },
    { name: "supply", type: "Long", required: true },
  ],
};

const linkType: LinkTypeDefinition = {
  name: "MintOf",
  sourceType: "TokenAccount",
  targetType: "TokenMint",
  cardinality: "many-to-one",
  bidirectional: false,
};

const actionType: ActionTypeDefinition = {
  name: "MintTokens",
  objectType: "TokenMint",
  parameters: [{ name: "amount", type: "u64", required: true }],
  submissionCriteria: { requiredSigners: ["authority"], requiredWritable: ["mint"] },
};

describe("SqliteStorage", () => {
  it("round-trips object types", async () => {
    const storage = newStorage();
    await storage.insertObjectType(objectType);

    expect(await storage.getObjectType("TokenMint")).toEqual(objectType);
    expect(await storage.listObjectTypes()).toEqual([objectType]);

    await storage.updateObjectType("TokenMint", { description: "Fungible token mint" });
    expect((await storage.getObjectType("TokenMint"))?.description).toBe("Fungible token mint");

    await storage.deleteObjectType("TokenMint");
    expect(await storage.getObjectType("TokenMint")).toBeNull();
    storage.close();
  });

  it("round-trips link and action types and clears all tables", async () => {
    const storage = newStorage();
    await storage.insertLinkType(linkType);
    await storage.insertActionType(actionType);

    expect(await storage.getLinkType("MintOf")).toEqual(linkType);
    expect(await storage.getActionType("MintTokens")).toEqual(actionType);
    expect(await storage.listLinkTypes()).toHaveLength(1);
    expect(await storage.listActionTypes()).toHaveLength(1);

    await storage.clear();
    expect(await storage.listLinkTypes()).toHaveLength(0);
    expect(await storage.listActionTypes()).toHaveLength(0);
    storage.close();
  });

  it("persists data across reopens of the same file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oms-sqlite-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "persist.db");

    const first = new SqliteStorage(dbPath);
    await first.insertObjectType(objectType);
    first.close();

    const second = new SqliteStorage(dbPath);
    expect(await second.getObjectType("TokenMint")).toEqual(objectType);
    second.close();
  });

  it("version() increments on writes only", async () => {
    const storage = newStorage();
    expect(storage.version()).toBe(0);
    await storage.insertObjectType(objectType);
    const v = storage.version();
    expect(v).toBe(1);
    await storage.listObjectTypes(); // read must not bump
    expect(storage.version()).toBe(v);
    await storage.deleteObjectType("TokenMint");
    expect(storage.version()).toBe(2);
    storage.close();
  });

  it("runInTransaction commits on success", async () => {
    const storage = newStorage();
    await storage.runInTransaction(async () => {
      await storage.insertObjectType(objectType);
      await storage.insertLinkType(linkType);
    });
    expect(await storage.listObjectTypes()).toHaveLength(1);
    expect(await storage.listLinkTypes()).toHaveLength(1);
    storage.close();
  });

  it("runInTransaction rolls back on throw (no partial writes)", async () => {
    const storage = newStorage();
    await storage.insertObjectType(objectType); // pre-existing row, must survive
    await expect(
      storage.runInTransaction(async () => {
        await storage.insertLinkType(linkType);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Link insert inside the aborted txn must be rolled back...
    expect(await storage.listLinkTypes()).toHaveLength(0);
    // ...and the pre-existing row must remain.
    expect(await storage.listObjectTypes()).toHaveLength(1);
    storage.close();
  });
});
