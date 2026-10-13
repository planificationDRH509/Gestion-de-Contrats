import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

let db: typeof import("./localDb");
let records: typeof import("./recordStore");
let write: typeof records.writeRecords;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal("BroadcastChannel", class { postMessage() {} });
  records = await import("./recordStore");
  write = records.writeRecords;
  // Reset durable rows without deleting a database with open connections.
  await write(null, { workspaces: [], applicants: [], contracts: [], dossiers: [], tags: [],
    contractTags: [], contractLists: [], cachedListWorkspaces: [], printJobs: [], outbox: [], syncMetadata: {} });
  const existing = (await records.readRecords())!;
  await write(existing, { ...existing, workspaces: [], outbox: [], contractLists: [], cachedListWorkspaces: [] });
  db = await import("./localDb");
  await db.initializeLocalDb();
  const initial = db.loadDb();
  initial.workspaces = [{ id: "w", name: "Original", createdAt: "1", updatedAt: "1" }];
  db.saveDb(initial);
  await db.flushLocalDbWrites();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("reloads a conflicting download and allows the next retry to persist", async () => {
  const base = db.loadDb();
  const other = structuredClone(base);
  other.workspaces[0].name = "Other tab";
  await write(base, other);
  const download = db.loadDb();
  download.workspaces[0].name = "Stale download";
  db.saveDb(download, { cacheOnly: true });
  await db.flushLocalDbWrites();
  expect(db.getLocalStorageError()).toBeNull();
  expect(db.loadDb().workspaces[0].name).toBe("Other tab");
  const retry = db.loadDb();
  retry.workspaces[0].name = "Fresh download";
  db.saveDb(retry, { cacheOnly: true });
  await db.flushLocalDbWrites();
  expect((await records.readRecords())!.workspaces[0].name).toBe("Fresh download");
});

it("retains a genuine user conflict and its outbox across retries", async () => {
  const base = db.loadDb();
  const other = structuredClone(base);
  other.workspaces[0].name = "Other tab";
  await write(base, other);
  const local = db.loadDb();
  local.workspaces[0].name = "My edit";
  local.outbox.push({ id: "q", workspaceId: "w", type: "contract.delete", payload: { id: "c" }, createdAt: "1" });
  db.saveDb(local);
  await expect(db.flushLocalDbWrites()).rejects.toThrow(/modifications concurrentes/);
  await expect(db.flushLocalDbWrites()).rejects.toThrow(/modifications concurrentes/);
  expect(db.loadDb().outbox).toHaveLength(1);
  expect(db.loadDb().workspaces[0].name).toBe("My edit");
  expect((await records.readRecords())!.workspaces[0].name).toBe("Other tab");
  expect((await records.readRecords())!.outbox).toEqual([]);
  // Once the competing edit is reverted, retry uses the original base.
  await write(other, base);
  await db.flushLocalDbWrites();
  expect((await records.readRecords())!.workspaces[0].name).toBe("My edit");
  expect((await records.readRecords())!.outbox).toHaveLength(1);
});

it("preserves newer user edits while recovering an in-flight cache conflict", async () => {
  const base = db.loadDb();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(records, "writeRecords").mockImplementationOnce(async (before, after) => {
    await gate;
    return write(before, after);
  });
  const cached = db.loadDb();
  cached.workspaces[0].name = "Stale download";
  db.saveDb(cached, { cacheOnly: true });
  await vi.waitFor(() => expect(records.writeRecords).toHaveBeenCalled());
  const user = db.loadDb();
  user.workspaces.push({ id: "new", name: "User data", createdAt: "1", updatedAt: "1" });
  user.outbox.push({ id: "q", workspaceId: "w", type: "contract.delete", payload: { id: "c" }, createdAt: "1" });
  db.saveDb(user);
  const other = structuredClone(base);
  other.workspaces[0].name = "Other tab";
  await write(base, other);
  release();
  await db.flushLocalDbWrites();
  const stored = (await records.readRecords())!;
  expect(stored.workspaces.find(w => w.id === "w")!.name).toBe("Other tab");
  expect(stored.workspaces.find(w => w.id === "new")!.name).toBe("User data");
  expect(stored.outbox).toHaveLength(1);
  expect(db.loadDb().workspaces.find(w => w.id === "w")!.name).toBe("Other tab");
});

it("does not replay a committed batch when the next batch conflicts", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(records, "writeRecords").mockImplementationOnce(async (before, after) => {
    await gate;
    return write(before, after);
  });
  const first = db.loadDb();
  first.workspaces[0].updatedAt = "2";
  first.outbox.push({ id: "first", workspaceId: "w", type: "contract.delete", payload: {}, createdAt: "1" });
  db.saveDb(first);
  await vi.waitFor(() => expect(records.writeRecords).toHaveBeenCalled());
  const next = db.loadDb();
  next.workspaces[0].name = "My edit";
  db.saveDb(next);
  const other = (await records.readRecords())!;
  const remote = structuredClone(other);
  remote.workspaces[0].name = "Other tab";
  await write(other, remote);
  release();
  await expect(db.flushLocalDbWrites()).rejects.toThrow(/modifications concurrentes/);
  const committed = (await records.readRecords())!;
  expect(committed.outbox).toHaveLength(1);
  const acknowledged = structuredClone(committed);
  acknowledged.outbox = [];
  acknowledged.workspaces[0].name = "Original";
  await write(committed, acknowledged);
  await db.flushLocalDbWrites();
  expect((await records.readRecords())!.outbox).toEqual([]);
  expect((await records.readRecords())!.workspaces[0].name).toBe("My edit");
});

it("retries a temporary storage failure without losing newer edits", async () => {
  vi.spyOn(records, "writeRecords").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
  const first = db.loadDb();
  first.workspaces[0].name = "My edit";
  first.outbox.push({ id: "q", workspaceId: "w", type: "contract.delete", payload: {}, createdAt: "1" });
  db.saveDb(first);
  await expect(db.flushLocalDbWrites()).rejects.toThrow();
  const newer = db.loadDb();
  newer.workspaces[0].name = "My newer edit";
  db.saveDb(newer);
  await db.flushLocalDbWrites();
  expect((await records.readRecords())!.workspaces[0].name).toBe("My newer edit");
  expect((await records.readRecords())!.outbox).toHaveLength(1);
  expect(db.getLocalStorageError()).toBeNull();
});

it("never discards a cache snapshot coalesced with a user edit", async () => {
  const base = db.loadDb();
  const other = structuredClone(base);
  other.workspaces[0].name = "Other tab";
  await write(base, other);
  const cache = db.loadDb();
  cache.workspaces[0].name = "Download";
  db.saveDb(cache, { cacheOnly: true });
  const user = db.loadDb();
  user.workspaces[0].name = "User edit";
  user.outbox.push({ id: "q", workspaceId: "w", type: "contract.delete", payload: {}, createdAt: "1" });
  db.saveDb(user);
  await expect(db.flushLocalDbWrites()).rejects.toThrow(/modifications concurrentes/);
  expect(db.loadDb().workspaces[0].name).toBe("User edit");
  expect(db.loadDb().outbox).toHaveLength(1);
  expect((await records.readRecords())!.workspaces[0].name).toBe("Other tab");
  await write(other, base);
  await db.flushLocalDbWrites();
});

it("recovers the list cache used by the Retry query", async () => {
  const lists = await import("./localListRepository");
  const list = { id: "l", workspaceId: "w", durationMonths: 6, visaNumber: null,
    sealedAt: null, version: 1, createdAt: "1", history: [], members: [] };
  lists.cacheContractLists("w", [list]);
  await db.flushLocalDbWrites();
  const base = db.loadDb();
  const other = structuredClone(base);
  other.contractLists[0].version = 2;
  other.contractLists[0].visaNumber = "Other tab";
  await write(base, other);
  lists.cacheContractLists("w", [{ ...list, version: 3, visaNumber: "Stale download" }]);
  await db.flushLocalDbWrites();
  expect(lists.readCachedContractLists("w")[0].visaNumber).toBe("Other tab");
  lists.cacheContractLists("w", [{ ...list, version: 4, visaNumber: "Fresh download" }]);
  await db.flushLocalDbWrites();
  expect(lists.readCachedContractLists("w")[0].visaNumber).toBe("Fresh download");
  expect(db.getLocalStorageError()).toBeNull();
});
