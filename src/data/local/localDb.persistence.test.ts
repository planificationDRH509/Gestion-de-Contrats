import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

let db: typeof import("./localDb");
let records: typeof import("./recordStore");
let write: typeof records.writeRecords;
let broadcast: { onmessage?: () => void };

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal("BroadcastChannel", class { constructor() { broadcast = this; } onmessage?: () => void; postMessage() {} });
  records = await import("./recordStore");
  write = records.writeRecords;
  // Reset durable rows without deleting a database with open connections.
  await write(null, { workspaces: [], applicants: [], contracts: [], dossiers: [], tags: [],
    contractTags: [], contractLists: [], cachedListWorkspaces: [], printJobs: [], outbox: [], syncMetadata: {} });
  const existing = (await records.readRecords())!;
  await write(existing, { ...existing, workspaces: [], applicants: [], contracts: [], dossiers: [], tags: [], contractTags: [], outbox: [], contractLists: [], cachedListWorkspaces: [] });
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


it("recovers a contract cache refresh without blocking subsequent writes or losing another tab's outbox", async () => {
  const cache = await import("./offlineStore");
  const contract = {
    id: "cache-contract", workspaceId: "w", applicantId: "applicant", status: "saisie" as const,
    gender: "Homme" as const, firstName: "Jean", lastName: "Louis", nif: "123", ninu: null,
    address: "Delmas", position: "Analyste", assignment: "Direction", salaryNumber: 45000,
    salaryText: "", durationMonths: 12, createdAt: "1", updatedAt: "1"
  };
  cache.cacheContracts([contract]);
  await db.flushLocalDbWrites();
  const base = db.loadDb();
  const other = structuredClone(base);
  other.contracts.find(item => item.id === contract.id)!.position = "Other tab edit";
  other.outbox.push({ id: "other-edit", workspaceId: "w", type: "contract.update", sequence: 0,
    payload: { id: contract.id, position: "Other tab edit" }, createdAt: "1" });
  await write(base, other);
  cache.cacheContracts([{ ...contract, position: "Stale download" }]);
  await db.flushLocalDbWrites();
  expect(db.getLocalStorageError()).toBeNull();
  expect(db.loadDb().contracts.find(item => item.id === contract.id)!.position).toBe("Other tab edit");
  expect(db.loadDb().outbox).toEqual(other.outbox);
  cache.cacheContracts([{ ...contract, position: "Another download" }]);
  await db.flushLocalDbWrites();
  expect((await records.readRecords())!.contracts.find(item => item.id === contract.id)!.position).toBe("Other tab edit");
  expect((await records.readRecords())!.outbox).toEqual(other.outbox);
});

it.each(["cacheApplicant", "cacheApplicants", "cacheDossiers", "cacheTags"] as const)(
  "recovers conflicting %s downloads", async method => {
    const cache = await import("./offlineStore");
    const initial = db.loadDb();
    initial.applicants.push({ id: "cache-applicant", workspaceId: "w", gender: "Homme", firstName: "Jean",
      lastName: "Louis", address: "Delmas", createdAt: "1", updatedAt: "1" });
    initial.dossiers.push({ id: "cache-dossier", workspaceId: "w", name: "Original", status: "active",
      isEphemeral: false, priority: "normal", contractTargetCount: 0, createdAt: "1", updatedAt: "1" });
    initial.tags.push({ id: "cache-tag", workspaceId: "w", name: "Original", color: "#64748b", createdAt: "1", updatedAt: "1" });
    db.saveDb(initial);
    await db.flushLocalDbWrites();
    const base = db.loadDb();
    const other = structuredClone(base);
    other.applicants.find(item => item.id === "cache-applicant")!.firstName = "Other tab";
    other.dossiers.find(item => item.id === "cache-dossier")!.name = "Other tab";
    other.tags.find(item => item.id === "cache-tag")!.name = "Other tab";
    await write(base, other);
    const applicant = { ...base.applicants.find(item => item.id === "cache-applicant")!, firstName: "Download" };
    if (method === "cacheApplicant") cache.cacheApplicant(applicant);
    if (method === "cacheApplicants") cache.cacheApplicants([applicant]);
    if (method === "cacheDossiers") cache.cacheDossiers([{ ...base.dossiers.find(item => item.id === "cache-dossier")!, name: "Download" }]);
    if (method === "cacheTags") cache.cacheTags([{ ...base.tags.find(item => item.id === "cache-tag")!, name: "Download" }]);
    await db.flushLocalDbWrites();
    expect(db.getLocalStorageError()).toBeNull();
    expect(db.loadDb().applicants.find(item => item.id === "cache-applicant")!.firstName).toBe("Other tab");
    expect(db.loadDb().dossiers.find(item => item.id === "cache-dossier")!.name).toBe("Other tab");
    expect(db.loadDb().tags.find(item => item.id === "cache-tag")!.name).toBe("Other tab");
  }
);

it("recovers a full workspace download followed by synchronization metadata", async () => {
  const cache = await import("./offlineStore");
  const initial = db.loadDb();
  initial.tags.push({ id: "full-cache-tag", workspaceId: "w", name: "Original", color: "#64748b", createdAt: "1", updatedAt: "1" });
  db.saveDb(initial);
  await db.flushLocalDbWrites();
  const base = db.loadDb();
  const other = structuredClone(base);
  other.tags[0].name = "Other tab";
  other.outbox.push({ id: "other-tab-queue", workspaceId: "w", type: "tag.create", payload: { id: "full-cache-tag" }, createdAt: "1", sequence: 0 });
  await write(base, other);
  cache.replaceWorkspaceCache("w", { applicants: [], contracts: [], dossiers: [], tags: [{ ...base.tags[0], name: "Stale download" }] });
  cache.setWorkspaceSyncMetadata("w", { lastFullSyncedAt: "2", remoteRevision: "2", lastError: null });
  await db.flushLocalDbWrites();
  expect(db.getLocalStorageError()).toBeNull();
  expect(db.loadDb().tags[0].name).toBe("Other tab");
  expect(db.loadDb().outbox).toEqual(other.outbox);
  // The discarded download must not be advertised as a successful new revision.
  expect(db.loadDb().syncMetadata.w?.remoteRevision).not.toBe("2");
});

it("does not block Retry when two tabs update synchronization timestamps", async () => {
  const cache = await import("./offlineStore");
  cache.setWorkspaceSyncMetadata("w", { lastSyncedAt: "1", lastError: null });
  await db.flushLocalDbWrites();
  const base = db.loadDb();
  const other = structuredClone(base);
  other.syncMetadata.w.lastSyncedAt = "3";
  await write(base, other);
  cache.setWorkspaceSyncMetadata("w", { lastSyncedAt: "2" });
  await db.flushLocalDbWrites();
  expect(db.getLocalStorageError()).toBeNull();
  expect(db.loadDb().syncMetadata.w.lastSyncedAt).toBe("3");
  cache.setWorkspaceSyncMetadata("w", { lastSyncedAt: "4" });
  await db.flushLocalDbWrites();
  expect((await records.readRecords())!.syncMetadata.w.lastSyncedAt).toBe("4");
});


it("announces external changes only after reading the other tab's persisted data", async () => {
  const base = db.loadDb();
  const other = structuredClone(base);
  other.workspaces[0].name = "Other tab";
  await write(base, other);
  const observed = vi.fn((event: Event) => {
    if ((event as CustomEvent).detail?.external) {
      expect(db.loadDb().workspaces[0].name).toBe("Other tab");
    }
  });
  window.addEventListener("contribution-offline-sync", observed);
  try {
    broadcast.onmessage?.();
    await vi.waitFor(() => expect(observed).toHaveBeenCalledWith(expect.objectContaining({ detail: { external: true } })));
  } finally {
    window.removeEventListener("contribution-offline-sync", observed);
  }
});
