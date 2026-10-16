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
  await write(existing, { ...existing, workspaces: [], applicants: [], contracts: [], dossiers: [], dossierAliases: [], tags: [], contractTags: [], outbox: [], contractLists: [], cachedListWorkspaces: [] });
  db = await import("./localDb");
  await db.initializeLocalDb();
  const initial = db.loadDb();
  initial.workspaces = [{ id: "w", name: "Original", createdAt: "1", updatedAt: "1" }];
  db.saveDb(initial);
  await db.flushLocalDbWrites();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("remembers an ignored import after a reload without retrying it or keeping a phantom contract", async () => {
  const { LocalContractRepository } = await import("./localContractRepository");
  const { getPendingOutbox } = await import("./offlineStore");
  const { skipDuplicateContract } = await import("./skipDuplicateContract");
  const contract = await new LocalContractRepository().create({ workspaceId: "w", applicantId: "123-456-789-0", nif: "123-456-789-0",
    gender: "Homme", firstName: "Jean", lastName: "Louis", address: "Delmas", status: "saisie", position: "Agent", assignment: "Centre",
    salaryNumber: 30000, salaryText: "TRENTE MILLE", durationMonths: 12, annee_fiscale: "2026-2027", skipFiscalYearDuplicate: true });
  skipDuplicateContract(getPendingOutbox()[0], { ...contract, id: "server-existing" });
  await db.flushLocalDbWrites();
  vi.resetModules();
  const reloaded = await import("./localDb");
  await reloaded.initializeLocalDb();
  const { readSkippedContractIds } = await import("./skipDuplicateContract");
  expect(readSkippedContractIds("w").has(contract.id)).toBe(true);
  expect(readSkippedContractIds("other").size).toBe(0);
  expect(reloaded.loadDb().contracts).toEqual([]);
  const receipt = reloaded.loadDb().outbox[0];
  expect(receipt).toMatchObject({ skippedDuplicateId: "server-existing", syncedAt: expect.any(String), payload: { id: contract.id, salaryNumber: 30000 } });
  expect((await import("./offlineStore")).getPendingOutbox()).toEqual([]);
});

it("persists reconciled folder IDs across reloads and resolves stale writes from another tab", async () => {
  const { LocalDossierRepository } = await import("./localDossierRepository");
  const { replaceLocalDossierId } = await import("./offlineStore");
  const dossier = await new LocalDossierRepository().create({ workspaceId: "w", name: "Import" });
  const stale = db.loadDb();
  replaceLocalDossierId("w", dossier.id, { ...dossier, id: "server-dossier" });
  await db.flushLocalDbWrites();
  const other = structuredClone(stale);
  other.outbox.push({ id: "late-contract", workspaceId: "w", type: "contract.create", createdAt: "2026-10-16", payload: { id: "late-contract", dossierId: dossier.id } });
  await write(stale, other);
  vi.resetModules();
  const reloaded = await import("./localDb");
  await reloaded.initializeLocalDb();
  const { getPendingOutbox } = await import("./offlineStore");
  const { LocalDossierRepository: ReloadedDossiers } = await import("./localDossierRepository");
  expect(await new ReloadedDossiers().getById(dossier.id)).toMatchObject({ id: "server-dossier" });
  expect(getPendingOutbox().find(item => item.id === "late-contract")?.payload.dossierId).toBe("server-dossier");
  expect(reloaded.loadDb().dossierAliases).toEqual([{ id: dossier.id, workspaceId: "w", dossierId: "server-dossier" }]);
});

it.each(['add', 'remove'] as const)('keeps list membership and contract status consistent across two tabs: %s', async action => {
  const { LocalContractRepository } = await import('./localContractRepository');
  const { mutateContractListOffline } = await import('./localListRepository');
  const { appendContractAuditEntry } = await import('../../lib/contractAudit');
  const user = { id: 'u', name: 'Admin', username: 'admin', role: 'admin' as const, workspaceId: 'w' };
  const contract = await new LocalContractRepository().create({ workspaceId: 'w', applicantId: '123-456-789-0', nif: '123-456-789-0',
    gender: 'Homme', firstName: 'Jean', lastName: 'Louis', address: 'Delmas', status: 'saisie', position: 'Agent', assignment: 'Centre',
    salaryNumber: 30000, salaryText: 'TRENTE MILLE', durationMonths: 12, annee_fiscale: '2025-2026' });
  if (action === 'remove') await mutateContractListOffline(user, { action: 'create', durationMonths: 12, contractIds: [contract.id] });
  const base = db.loadDb();
  const other = structuredClone(base);
  const externalAt = new Date(Date.parse(contract.modifiedAt!) + 1000).toISOString();
  Object.assign(other.contracts.find(c => c.id === contract.id)!, { salaryNumber: 40000,
    modifiedAt: externalAt, updatedAt: externalAt,
    auditHistory: appendContractAuditEntry(base.contracts.find(c => c.id === contract.id)!.auditHistory,
      { action: 'modification', at: externalAt, changes: [{ field: 'salaryNumber', previousValue: 30000, newValue: 40000 }] }) });
  await write(base, other);
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(Date.parse(contract.modifiedAt!) + 2000);
    await mutateContractListOffline(user, action === 'add'
      ? { action: 'create', durationMonths: 12, contractIds: [contract.id] }
      : { action: 'assign', contractIds: [contract.id] });
    const stored = (await records.readRecords())!;
    expect(stored.contractLists.some(l => l.members.some(m => m.id === contract.id))).toBe(action === 'add');
    const saved = stored.contracts.find(c => c.id === contract.id)!;
    expect(saved).toMatchObject({ status: action === 'add' ? 'liste' : 'saisie', salaryNumber: 40000, modifiedAt: externalAt });
    expect(saved.auditHistory!.entries.flatMap(e => e.changes).map(c => c.field)).toEqual(expect.arrayContaining(['salaryNumber', 'status']));
    expect(stored.outbox.filter(item => item.type === 'list.operation')).toHaveLength(action === 'add' ? 1 : 2);
  } finally { vi.useRealTimers(); }
});

it.each(['assign', 'remove'] as const)('keeps tag changes after another tab edits the contract: %s', async action => {
  const { LocalContractRepository } = await import('./localContractRepository');
  const { LocalTagRepository } = await import('./localTagRepository');
  const contracts = new LocalContractRepository(), tags = new LocalTagRepository();
  const contract = await contracts.create({ workspaceId: 'w', applicantId: '123-456-789-0', nif: '123-456-789-0',
    gender: 'Homme', firstName: 'Jean', lastName: 'Louis', address: 'Delmas', status: 'saisie', position: 'Agent', assignment: 'Centre',
    salaryNumber: 30000, salaryText: 'TRENTE MILLE', durationMonths: 12, annee_fiscale: '2025-2026' });
  const tag = await tags.create({ workspaceId: 'w', name: 'Urgent' });
  if (action === 'remove') await tags.assignToContract('w', contract.id, tag.id);
  const base = db.loadDb(), other = structuredClone(base);
  Object.assign(other.contracts.find(c => c.id === contract.id)!, { salaryNumber: 40000,
    modifiedAt: new Date(Date.parse(contract.modifiedAt!) + 1000).toISOString() });
  await write(base, other);
  if (action === 'remove') await tags.removeFromContract('w', contract.id, tag.id);
  else await tags.assignToContract('w', contract.id, tag.id);
  expect((await records.readRecords())!.contractTags.filter(link => link.contractId === contract.id)).toHaveLength(action === 'assign' ? 1 : 0);
  expect((await contracts.getById(contract.id))!.tags?.map(t => t.id)).toEqual(action === 'assign' ? [tag.id] : []);
  expect((await contracts.list({ workspaceId: 'w', tagId: tag.id })).items.map(c => c.id)).toEqual(action === 'assign' ? [contract.id] : []);
  expect((await contracts.getById(contract.id))!.salaryNumber).toBe(40000);
});

const legacyPerson = { id: "concurrent", workspaceId: "w", gender: "Homme", firstName: "Original", lastName: "Louis",
  nif: "123-456-789-0", ninu: null, address: "Delmas", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
it.each([
  { table: "workspaces", field: "name", row: { id: "concurrent", name: "Original", createdAt: "1", updatedAt: "1" } },
  { table: "applicants", field: "firstName", row: legacyPerson },
  { table: "contracts", field: "firstName", row: { ...legacyPerson, applicantId: legacyPerson.nif, status: "saisie",
    position: "Analyste", assignment: "Planification", salaryNumber: 30000, salaryText: "TRENTE MILLE", durationMonths: 12 } },
  { table: "dossiers", field: "name", row: { id: "concurrent", workspaceId: "w", name: "Original", status: "active", createdAt: "1", updatedAt: "1" } },
  { table: "tags", field: "name", row: { id: "concurrent", workspaceId: "w", name: "Original", color: "blue", createdAt: "1", updatedAt: "1" } },
  { table: "contractLists", field: "visaNumber", row: { id: "concurrent", workspaceId: "w", durationMonths: 12,
    visaNumber: "Original", sealedAt: null, version: 1, members: [], history: [], createdAt: "1" } }
] as const)(
  "does not let a stale $table download block an unrelated user save in the same batch", async ({ table, field, row }) => {
    const initial = db.loadDb();
    // Undated legacy/cache records use structural conflict detection.
    Object.assign(initial, { [table]: [row] });
    db.saveDb(initial);
    await db.flushLocalDbWrites();
    const base = db.loadDb();
    const other = structuredClone(base);
    Object.assign(other[table][0], { [field]: "Other tab" });
    await write(base, other);
    const cache = db.loadDb();
    Object.assign(cache[table][0], { [field]: "Stale download" });
    cache.syncMetadata.w = { remoteRevision: "stale-download", snapshotVersion: 1 };
    db.saveDb(cache, { cacheOnly: true });
    const user = db.loadDb();
    user.printJobs.push({ id: "print", workspaceId: "w", contractIds: ["c"], createdAt: "1" });
    user.outbox.push({ id: "q", workspaceId: "w", type: "print.create", payload: { id: "print" }, createdAt: "1" });
    db.saveDb(user);
    await db.flushLocalDbWrites();
    const stored = (await records.readRecords())!;
    expect(stored[table][0]).toMatchObject({ [field]: "Other tab" });
    expect(stored.syncMetadata.w?.remoteRevision).not.toBe("stale-download");
    expect(stored.printJobs).toHaveLength(1);
    expect(stored.outbox).toHaveLength(1);
    expect(db.loadDb()[table][0]).toMatchObject({ [field]: "Other tab" });
    expect(db.getLocalStorageError()).toBeNull();
  }
);

it.each(["dossier.create", "tag.create", "dossier.delete"] as const)(
  "durably retries %s after a storage failure without duplicating the action", async type => {
    const { LocalDossierRepository } = await import("./localDossierRepository");
    const { LocalTagRepository } = await import("./localTagRepository");
    const dossiers = new LocalDossierRepository();
    const dossier = type === "dossier.delete" ? await dossiers.create({ workspaceId: "w", name: "To delete" }) : null;
    const mutate = () => type === "dossier.create" ? dossiers.create({ workspaceId: "w", name: "Retry" })
      : type === "tag.create" ? new LocalTagRepository().create({ workspaceId: "w", name: "Retry" })
      : dossiers.delete(dossier!.id, "w");
    vi.spyOn(records, "writeRecords")
      .mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"))
      .mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(mutate()).rejects.toThrow();
      expect((await records.readRecords())!.outbox.filter(item => item.type === type)).toHaveLength(0);
    }
    await mutate();
    const stored = (await records.readRecords())!;
    expect(stored.outbox.filter(item => item.type === type)).toHaveLength(1);
    if (type === "dossier.delete") expect(stored.dossiers[0].deletedAt).toBeTruthy();
    else expect(type === "tag.create" ? stored.tags : stored.dossiers).toHaveLength(1);
    expect(db.getLocalStorageError()).toBeNull();
  }
);

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

it("persists a full download over legacy rows whose defaults exist only in memory", async () => {
  const base = (await records.readRecords())!;
  const legacy = structuredClone(base);
  legacy.applicants.push({ id: "legacy", workspaceId: "w", gender: "Homme", firstName: "Jean", lastName: "TEST", address: "", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
  await write(base, legacy);
  await db.refreshLocalDb();
  expect(db.loadDb().applicants[0].phone).toBeNull();
  const downloaded = db.loadDb();
  downloaded.applicants[0].phone = "12345678";
  downloaded.applicants.push({ ...downloaded.applicants[0], id: "newly-downloaded" });
  db.saveDb(downloaded, { cacheOnly: true });
  await db.flushLocalDbWrites();
  expect((await records.readRecords())!.applicants).toHaveLength(2);
  expect(db.loadDb().applicants[0].phone).toBe("12345678");
});

it.each([false, true])("finishes an import despite concurrent sync status (resume a previously blocked lot: %s)", async resume => {
  const { runContractImport } = await import("../../features/contracts/contractImportRun");
  const { LocalApplicantRepository } = await import("./localApplicantRepository");
  const { LocalContractRepository } = await import("./localContractRepository");
  const { LocalDossierRepository } = await import("./localDossierRepository");
  const cache = await import("./offlineStore");
  cache.setWorkspaceSyncMetadata("w", { lastSyncedAt: "2026-10-15T10:00:00Z", lastError: null });
  await db.flushLocalDbWrites();
  const provider = { applicants: new LocalApplicantRepository(), contracts: new LocalContractRepository(), dossiers: new LocalDossierRepository() };
  const create = vi.spyOn(provider.contracts, "create");
  let emulateOldConflict = resume;
  vi.spyOn(records, "writeRecords").mockImplementation(async (before, after) => {
    if (emulateOldConflict && before) {
      // Reproduce the previous app's blocked transaction, including its original
      // merge base and all the requests retained for the remaining rows.
      records.mergeRecord(before.syncMetadata.w, after.syncMetadata.w, (await records.readRecords())!.syncMetadata.w);
    }
    return write(before, after);
  });
  const upsert = provider.applicants.upsert.bind(provider.applicants);
  let count = 0;
  vi.spyOn(provider.applicants, "upsert").mockImplementation(async value => {
    if (++count === 9) {
      const base = (await records.readRecords())!;
      const other = structuredClone(base);
      other.syncMetadata.w.lastSyncedAt = "2026-10-15T10:00:03Z";
      await write(base, other);
      cache.setWorkspaceSyncMetadata("w", { lastSyncedAt: "2026-10-15T10:00:02Z" });
    }
    return upsert({ ...value, id: value.nif! });
  });
  const input = {
    workspaceId: "w", responsibleUserId: "u", fiscalYear: "2026-2027", dossierId: null,
    rows: Array.from({ length: 20 }, (_, index) => ({
      contractId: `import-${index}`, sourceRowNumber: index + 2, nif: String(1234567890 + index), ninu: null,
      firstName: "Jean", lastName: "TEST", gender: "Homme" as const, address: "Delmas", phone: null,
      position: "Agent", assignment: "MSPP", salaryNumber: 30000, salaryText: "", durationMonths: 12, commentaire: null
    }))
  };
  let result = await runContractImport(provider, input);
  if (resume) {
    expect(result.contracts).toHaveLength(8);
    expect(result.failures).toHaveLength(12);
    expect(result.failures.every(item => item.error?.includes("modifications concurrentes"))).toBe(true);
    emulateOldConflict = false;
    result = await runContractImport(provider, input);
  }
  expect(result.failures).toEqual([]);
  expect(result.contracts).toHaveLength(20);
  expect(create).toHaveBeenCalledTimes(20);
  const stored = (await records.readRecords())!;
  expect(stored.contracts).toHaveLength(20);
  expect(stored.outbox.filter(item => item.type === "contract.create")).toHaveLength(20);
  expect(stored.syncMetadata.w.lastSyncedAt).toBe("2026-10-15T10:00:03Z");
  expect(db.getLocalStorageError()).toBeNull();
});

it("keeps an independent edit when a stale in-memory snapshot changes synchronization status", async () => {
  const cache = await import("./offlineStore");
  cache.setWorkspaceSyncMetadata("w", { lastSyncedAt: "2026-10-15T10:00:00Z" });
  await db.flushLocalDbWrites();
  const stale = db.loadDb();
  cache.setWorkspaceSyncMetadata("w", { lastSyncedAt: "2026-10-15T10:00:03Z" });
  stale.syncMetadata.w.lastSyncedAt = "2026-10-15T10:00:02Z";
  stale.workspaces[0].name = "My edit";
  stale.outbox.push({ id: "q", workspaceId: "w", type: "contract.delete", payload: { id: "c" }, createdAt: "1" });
  expect(() => db.saveDb(stale)).not.toThrow();
  await db.flushLocalDbWrites();
  const stored = (await records.readRecords())!;
  expect(stored.workspaces[0].name).toBe("My edit");
  expect(stored.outbox).toHaveLength(1);
  expect(stored.syncMetadata.w.lastSyncedAt).toBe("2026-10-15T10:00:03Z");
});
