import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { clear } from "idb-keyval";
import { readRecords, writeRecords } from "./recordStore";
import type { LocalDb } from "./localDb";
import { openLocalValue, sealLocalValue } from "./deviceVault";

const empty = (): LocalDb => ({ applicants: [], contracts: [], dossiers: [], tags: [], contractTags: [],
  contractLists: [], cachedListWorkspaces: [], workspaces: [], printJobs: [], outbox: [], syncMetadata: {} });

async function rawDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("contribution_records_v1", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  // Initialize the object store before the test-side connection is opened.
  await writeRecords(null, empty());
  const db = await rawDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("records", "readwrite");
    transaction.objectStore("records").clear();
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  await clear();
});

it("preserves independent writes from two stale tabs, including their outboxes", async () => {
  const initial = empty();
  await writeRecords(null, initial);
  const first = structuredClone(initial), second = structuredClone(initial);
  first.workspaces.push({ id: "a", name: "Secret A", createdAt: "1", updatedAt: "1" });
  second.workspaces.push({ id: "b", name: "Secret B", createdAt: "1", updatedAt: "1" });
  first.outbox.push({ id: "a", workspaceId: "a", type: "contract.delete", payload: { id: "c1" }, createdAt: "1" });
  second.outbox.push({ id: "b", workspaceId: "b", type: "contract.delete", payload: { id: "c2" }, createdAt: "1" });
  await Promise.all([writeRecords(initial, first), writeRecords(initial, second)]);
  const restored = await readRecords();
  expect(restored?.workspaces.map(w => w.id)).toEqual(["a", "b"]);
  expect(restored?.outbox).toHaveLength(2);
  const db = await rawDatabase();
  const raw = await new Promise<unknown>(resolve => {
    const request = db.transaction("records").objectStore("records").get("workspaces:a");
    request.onsuccess = () => resolve(request.result);
  });
  expect(JSON.stringify(raw)).not.toContain("Secret A");
  expect(raw).toMatchObject({ value: { encrypted: 1 } });
  db.close();
});

it("rejects a conflicting tab without committing its associated outbox", async () => {
  const initial = empty();
  initial.workspaces.push({ id: "a", name: "Original", createdAt: "1", updatedAt: "1" });
  await writeRecords(null, initial);
  const first = structuredClone(initial), second = structuredClone(initial);
  first.workspaces[0].name = "First";
  second.workspaces[0].name = "Second";
  second.outbox.push({ id: "q", workspaceId: "a", type: "contract.delete", payload: { id: "c" }, createdAt: "1" });
  await writeRecords(initial, first);
  await expect(writeRecords(initial, second)).rejects.toThrow(/autre onglet/);
  const restored = await readRecords();
  expect(restored?.workspaces[0].name).toBe("First");
  expect(restored?.outbox).toEqual([]);
});

it("aborts data and outbox together when storage rejects a write", async () => {
  const initial = empty();
  await writeRecords(null, initial);
  const next = structuredClone(initial);
  next.workspaces.push({ id: "a", name: "New", createdAt: "1", updatedAt: "1" });
  next.outbox.push({ id: "q", workspaceId: "a", type: "contract.delete", payload: {}, createdAt: "1" });
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value, key) {
    if (value?.key === "workspaces:a") throw new DOMException("Full", "QuotaExceededError");
    return original.call(this, value, key);
  });
  await expect(writeRecords(initial, next)).rejects.toThrow();
  expect((await readRecords())?.outbox).toEqual([]);
  expect((await readRecords())?.workspaces).toEqual([]);
});

it("migrates legacy salaries and queued base versions without losing amounts or audit history", async () => {
  const connection = await rawDatabase();
  const legacy = { id: "c", salaryNumber: 45000.25, salaryText: "ancien texte",
    auditHistory: { entries: [{ changes: [{ field: "salaryText", previousValue: "historique" }] }] } };
  const rows = [
    { key: "ready", value: true },
    { key: "contracts:c", value: await sealLocalValue(legacy) },
    { key: "outbox:q", value: await sealLocalValue({ id: "q", createdAt: "1", type: "contract.update",
      payload: { id: "c", salaryNumber: 50000, salaryText: "cinquante mille", baseContract: legacy } }) }
  ];
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction("records", "readwrite");
    rows.forEach(row => tx.objectStore("records").put(row));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  const migrated = await readRecords();
  expect(migrated?.contracts[0]).toMatchObject({ salaryNumber: 45000.25, auditHistory: legacy.auditHistory });
  expect(migrated?.contracts[0]).not.toHaveProperty("salaryText");
  expect(migrated?.outbox[0].payload).not.toHaveProperty("salaryText");
  expect(migrated?.outbox[0].payload.baseContract).not.toHaveProperty("salaryText");
  const raw = await new Promise<any>(resolve => {
    const request = connection.transaction("records").objectStore("records").get("contracts:c");
    request.onsuccess = () => resolve(request.result);
  });
  expect(await openLocalValue(raw.value)).not.toHaveProperty("salaryText");
  expect(await readRecords()).toEqual(migrated);
  connection.close();
});
