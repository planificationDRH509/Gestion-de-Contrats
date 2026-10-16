import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract, OutboxItem, Tag } from "../types";
import { loadDb, saveDb } from "../local/localDb";
import * as localDbModule from "../local/localDb";
import { queueOutbox, setOutboxError } from "../local/localOutbox";
import { getPendingOutbox } from "../local/offlineStore";
import { readSkippedContractIds } from "../local/skipDuplicateContract";
import { cacheSalaryGrid, readSalaryGridCache } from "../../features/salary-grid/salaryGridCache";
import { LEGACY_MINISTER } from "../../lib/ministers";
import { getSyncIssues, resolveSyncIssue } from "./syncIssues";

const mocks = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), sync: vi.fn(), workspace: vi.fn(), rpc: vi.fn() }));
vi.mock("./supabaseProvider", () => ({ readSyncResolutionRecord: mocks.read, deleteSyncResolutionContract: mocks.remove,
  syncSupabaseOutbox: mocks.sync, syncSupabaseWorkspace: mocks.workspace }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
const workspaceId = "workspace_default";
const actor = { id: "author", workspaceId, role: "admin", taskSessionToken: "test-session" };
const contract = (id: string): Contract => ({ id, workspaceId, applicantId: "123", nif: "123", firstName: "Jean", lastName: "LOUIS", gender: "Homme",
  address: "Delmas", position: "Agent", assignment: "Direction", salaryNumber: 1000, salaryText: "mille", durationMonths: 12,
  status: "saisie", createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null, tags: [] });
function seed(records: Contract[]) { const db = loadDb(); db.contracts = records; saveDb(db); }
function error(type: OutboxItem["type"], payload: Record<string, unknown>, message = "Erreur à résoudre") {
  const item = queueOutbox(workspaceId, type, payload); setOutboxError(item.id, message); return item.id;
}
async function resolve(id: string, action: Parameters<typeof resolveSyncIssue>[2]) {
  const issue = getSyncIssues(workspaceId).find(item => item.id === id)!;
  return resolveSyncIssue(workspaceId, id, action, issue.fingerprint);
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("contribution_auth", JSON.stringify(actor));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.read.mockReset().mockImplementation(async (kind, id) => kind === "contract" ? contract(id) : null);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.sync.mockReset().mockResolvedValue(undefined);
  mocks.workspace.mockReset().mockResolvedValue(true);
  mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});

describe("sync issue resolution", () => {
  it("enumerates every workspace error, including a distinct workspace failure", () => {
    const one = error("contract.update", { id: "one" }, "Erreur 1");
    error("contract.update", { id: "two" }, "Erreur 2");
    const elsewhere = queueOutbox("other-workspace", "contract.update", { id: "three" });
    setOutboxError(elsewhere.id, "Autre espace");
    const db = loadDb(); db.syncMetadata[workspaceId] = { lastError: "Téléchargement interrompu" }; saveDb(db);
    expect(getSyncIssues(workspaceId).map(issue => issue.message)).toEqual(["Erreur 1", "Erreur 2", "Téléchargement interrompu"]);
    expect(getSyncIssues(workspaceId).find(issue => issue.id === one)?.actions).toContain("delete-server");
  });

  it("restores one contract, preserving unrelated errors and valid pending pins, tags and lists", async () => {
    const one = contract("one"), two = contract("two"); seed([{ ...one, salaryNumber: 9999 }, two]);
    const id = error("contract.update", { id: one.id, salaryNumber: 9999, baseContract: one });
    error("contract.update", { id: two.id, assignment: "Autre" }, "Autre erreur");
    queueOutbox(workspaceId, "pin.set", { contractId: one.id, userId: actor.id, pinned: true });
    const tag: Tag = { id: "tag", workspaceId, name: "Urgent", color: "red", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    const db = loadDb(); db.tags.push(tag); saveDb(db);
    queueOutbox(workspaceId, "tag.assign", { contractId: one.id, tagId: tag.id });
    queueOutbox(workspaceId, "list.operation", { actorId: actor.id, operation: { action: "assign", listId: "list", contractIds: [one.id] }, contractIds: [one.id], expectedLists: {}, expectedMemberships: {}, applicantIds: ["123"] });
    await resolve(id, "refresh-local");
    expect(loadDb().contracts.find(c => c.id === one.id)).toMatchObject({ salaryNumber: 1000, tags: [tag] });
    expect(getPendingOutbox().map(item => item.type)).toEqual(["contract.update", "pin.set", "tag.assign", "list.operation"]);
    expect(getSyncIssues(workspaceId)).toEqual([expect.objectContaining({ message: "Autre erreur" })]);
    expect(mocks.sync).toHaveBeenCalledOnce();
  });

  it("splits a later bulk edit so discarding one contract preserves other selected contracts", async () => {
    seed([contract("one"), { ...contract("two"), durationMonths: 6 }]);
    const id = error("contract.update", { id: "one", salaryNumber: 2000 });
    queueOutbox(workspaceId, "contract.update", { contractIds: ["one", "two"], durationMonths: 6 });
    await resolve(id, "refresh-local");
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ payload: { id: "two", durationMonths: 6 } })]);
    expect(mocks.read).toHaveBeenCalledWith("contract", "one", workspaceId);
    expect(mocks.read).not.toHaveBeenCalledWith("contract", "two", workspaceId);
    expect(loadDb().contracts.find(c => c.id === "two")?.durationMonths).toBe(6);
  });

  it("archives an ignored unsent creation and removes only its references from a pending list", async () => {
    seed([contract("new"), contract("keep")]); mocks.read.mockResolvedValue(null);
    const id = error("contract.create", { ...contract("new"), skipFiscalYearDuplicate: true });
    queueOutbox(workspaceId, "pin.set", { contractId: "new", userId: actor.id, pinned: true });
    queueOutbox(workspaceId, "list.operation", { actorId: actor.id, operation: { action: "create", createId: "list", durationMonths: 12, contractIds: ["new", "keep"] },
      contractIds: ["new", "keep"], applicantIds: ["123"], expectedLists: { list: null }, expectedMemberships: { new: null, keep: null } });
    await resolve(id, "ignore");
    expect(loadDb().contracts.map(c => c.id)).toEqual(["keep"]);
    expect(readSkippedContractIds(workspaceId).has("new")).toBe(true);
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ type: "list.operation", payload: expect.objectContaining({ contractIds: ["keep"],
      operation: expect.objectContaining({ contractIds: ["keep"] }), expectedMemberships: { keep: null } }) })]);
  });

  it("detaches contracts from an ignored local-only dossier without abandoning their creation", async () => {
    seed([{ ...contract("new"), dossierId: "folder" }]);
    const id = error("dossier.create", { id: "folder", name: "Import" });
    queueOutbox(workspaceId, "contract.create", { ...contract("new"), dossierId: "folder" });
    mocks.read.mockResolvedValue(null);
    await resolve(id, "delete-local");
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ type: "contract.create", payload: expect.objectContaining({ dossierId: null }) })]);
    expect(loadDb().contracts[0].dossierId).toBeNull();
  });

  it.each([false, true])("removes ignored tags from embedded contracts and queued assignments (deleted on server: %s)", async deleted => {
    const tag: Tag = { id: "tag", workspaceId, name: "Nouveau", color: "red", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    seed([{ ...contract("one"), tags: [tag] }]);
    const db = loadDb(); db.tags = [tag]; db.contractTags = [{ contractId: "one", tagId: tag.id, createdAt: tag.createdAt }]; saveDb(db);
    const id = error("tag.create", { ...tag }); queueOutbox(workspaceId, "tag.assign", { contractId: "one", tagId: tag.id });
    mocks.read.mockResolvedValue(deleted ? { ...tag, deletedAt: "2026-01-02" } : null);
    await resolve(id, "ignore");
    expect(loadDb().contracts[0].tags).toEqual([]); expect(loadDb().contractTags).toEqual([]); expect(getPendingOutbox()).toEqual([]);
  });

  it("reissues every later edit with increasing clocks so preserving the first edit cannot lose the next", async () => {
    seed([{ ...contract("one"), salaryNumber: 2000, assignment: "Nouvelle direction" }]);
    const id = error("contract.update", { id: "one", salaryNumber: 2000, baseContract: contract("one") });
    const later = queueOutbox(workspaceId, "contract.update", { id: "one", assignment: "Nouvelle direction", baseContract: { ...contract("one"), salaryNumber: 2000 } });
    let replayed: OutboxItem[] = [];
    mocks.sync.mockImplementation(async () => { replayed = getPendingOutbox(); const db = loadDb(); db.outbox = []; saveDb(db); });
    await resolve(id, "refresh-server");
    expect(replayed).toHaveLength(2); expect(replayed[0].id).not.toBe(id); expect(replayed[1].id).not.toBe(later.id);
    expect(Date.parse(replayed[1].modifiedAt!)).toBeGreaterThan(Date.parse(replayed[0].modifiedAt!));
    expect(replayed[0].payload.salaryNumber).toBe(2000); expect(replayed[1].payload.assignment).toBe("Nouvelle direction");
  });

  it("promotes only the affected portion of a later bulk status edit", async () => {
    seed([contract("one"), contract("two")]);
    const id = error("contract.update", { id: "one", salaryNumber: 2000, baseContract: contract("one") });
    const bulk = queueOutbox(workspaceId, "contract.update", { contractIds: ["one", "two"], status: "saisie" });
    const laterTwo = queueOutbox(workspaceId, "contract.update", { id: "two", assignment: "Autre" });
    let replayed: OutboxItem[] = [];
    mocks.sync.mockImplementation(async () => { replayed = getPendingOutbox(); const db = loadDb(); db.outbox = []; saveDb(db); });
    await resolve(id, "refresh-server");
    const untouched = replayed.find(item => item.id === bulk.id)!;
    expect(untouched.payload.contractIds).toEqual(["two"]); expect(untouched.modifiedAt).toBe(bulk.modifiedAt);
    const promoted = replayed.find(item => Array.isArray(item.payload.contractIds) && item.payload.contractIds.includes("one"))!;
    expect(promoted.id).not.toBe(bulk.id); expect(Date.parse(promoted.modifiedAt!)).toBeGreaterThan(Date.parse(replayed[0].modifiedAt!));
    expect(replayed.find(item => item.id === laterTwo.id)?.modifiedAt).toBe(laterTwo.modifiedAt);
  });

  it("restores an identity without abandoning the valid contract creation that uses it", async () => {
    seed([{ ...contract("one"), firstName: "Modifié" }]);
    const id = error("applicant.upsert", { id: "123", nif: "123", firstName: "Modifié", lastName: "LOUIS", workspaceId });
    queueOutbox(workspaceId, "contract.create", { ...contract("one"), firstName: "Modifié" });
    mocks.read.mockResolvedValue({ id: "123", nif: "123", workspaceId, firstName: "Jean", lastName: "LOUIS", gender: "Homme", address: "Delmas", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
    await resolve(id, "refresh-local");
    expect(loadDb().contracts[0].firstName).toBe("Jean");
    expect(getPendingOutbox().map(item => item.type)).toEqual(["contract.create"]);
  });

  it("restores rejected pins while retaining another pending toggle", async () => {
    const id = error("pin.set", { contractId: "one", userId: actor.id, pinned: true });
    queueOutbox(workspaceId, "pin.set", { contractId: "two", userId: actor.id, pinned: true });
    mocks.rpc.mockResolvedValue({ data: ["remote"], error: null });
    await resolve(id, "refresh-local");
    expect(JSON.parse(localStorage.getItem(`contribution_pinned_contracts:${actor.id}`)!)).toEqual(["remote", "two"]);
    expect(getPendingOutbox()).toHaveLength(1);
  });

  it("restores a rejected list without replacing an independent pending list", async () => {
    seed([contract("one")]);
    const localList = { id: "list", workspaceId, durationMonths: 12, visaNumber: "local", sealedAt: null, version: 2, createdAt: "2026-01-01", history: [], members: [] };
    const db = loadDb(); db.contractLists = [localList, { ...localList, id: "other", visaNumber: "pending" }]; saveDb(db);
    const id = error("list.operation", { actorId: actor.id, operation: { action: "visa", listId: "list", visaNumber: "local" }, contractIds: [], applicantIds: [], expectedLists: { list: null }, expectedMemberships: {} });
    queueOutbox(workspaceId, "list.operation", { actorId: actor.id, operation: { action: "visa", listId: "other", visaNumber: "pending" }, contractIds: [], applicantIds: [], expectedLists: { other: null }, expectedMemberships: {} });
    mocks.rpc.mockResolvedValue({ data: [{ ...localList, visaNumber: "remote" }], error: null });
    await resolve(id, "refresh-local");
    expect(loadDb().contractLists.map(list => [list.id, list.visaNumber])).toEqual([["other", "pending"], ["list", "remote"]]);
    expect(getPendingOutbox()).toHaveLength(1);
  });

  it("refreshes the server reference baseline before dropping the rejected overlay", async () => {
    const entry = { id: "salary", masculine: "Agent", feminine: "Agente", category: "A", salaries: [1000], aliases: [], jobType: "Technique" as const,
      source: "test", sourceRows: [], notes: "", active: true, version: 1 };
    cacheSalaryGrid([entry]);
    const id = error("reference.change", { scope: "salary", patches: [{ id: entry.id, before: entry, after: { ...entry, salaries: [9999] } }] });
    mocks.rpc.mockResolvedValue({ data: [{ ...entry, salaries: [2000] }], error: null });
    await resolve(id, "refresh-local");
    expect(readSalaryGridCache()?.find(value => value.id === entry.id)?.salaries).toEqual([2000]);
    expect(getPendingOutbox()).toEqual([]);
  });

  it("cancels only creations using an abandoned local minister", async () => {
    seed([{ ...contract("new"), nif: "777", applicantId: "777", ministerId: "missing-minister" }, { ...contract("keep"), ministerId: LEGACY_MINISTER.id }]);
    const id = error("reference.change", { scope: "ministers", patches: [{ id: "missing-minister", before: null,
      after: { ...LEGACY_MINISTER, id: "missing-minister" } }] });
    queueOutbox(workspaceId, "applicant.upsert", { id: "777", nif: "777", importContractId: "new" });
    queueOutbox(workspaceId, "contract.create", { ...contract("new"), nif: "777", applicantId: "777", ministerId: "missing-minister" });
    queueOutbox(workspaceId, "contract.create", { ...contract("keep"), ministerId: LEGACY_MINISTER.id });
    mocks.rpc.mockResolvedValue({ data: { ministers: [LEGACY_MINISTER], currentMinisterId: LEGACY_MINISTER.id }, error: null });
    mocks.read.mockResolvedValue(null);
    await resolve(id, "ignore");
    expect(readSkippedContractIds(workspaceId).has("new")).toBe(true);
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ payload: expect.objectContaining({ id: "keep" }) })]);
    expect(loadDb().contracts.map(value => value.id)).toEqual(["keep"]);
  });

  it("restores the row's imported identity when abandoning its unsent contract", async () => {
    seed([{ ...contract("new"), firstName: "Import" }]);
    error("applicant.upsert", { id: "123", nif: "123", workspaceId, firstName: "Import", importContractId: "new" });
    const id = error("contract.create", { ...contract("new"), firstName: "Import" });
    mocks.read.mockImplementation(async kind => kind === "applicant" ? { id: "123", nif: "123", workspaceId, firstName: "Serveur", lastName: "LOUIS", gender: "Homme", address: "Delmas", createdAt: "2026-01-01", updatedAt: "2026-01-01" } : null);
    await resolve(id, "ignore");
    expect(loadDb().applicants.find(value => value.id === "123")?.firstName).toBe("Serveur");
    expect(getPendingOutbox()).toEqual([]);
  });

  it("rejects a stale dialog and never discards changes edited while the server read is pending", async () => {
    seed([contract("one")]); const id = error("contract.update", { id: "one", salaryNumber: 2000 });
    const before = getSyncIssues(workspaceId)[0];
    mocks.read.mockImplementation(async () => { queueOutbox(workspaceId, "contract.update", { id: "one", assignment: "Nouvelle" }); return contract("one"); });
    await expect(resolveSyncIssue(workspaceId, id, "ignore", before.fingerprint)).rejects.toThrow(/changé/);
    expect(getPendingOutbox()).toHaveLength(2); expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("keeps the queue intact when the server cannot be read", async () => {
    seed([contract("one")]); const id = error("contract.update", { id: "one", salaryNumber: 2000 });
    const before = getPendingOutbox(); mocks.read.mockRejectedValue(new Error("Failed to fetch"));
    await expect(resolve(id, "ignore")).rejects.toThrow("Failed to fetch");
    expect(getPendingOutbox()).toEqual(before);
  });

  it("does not offer deletion on the server to an agent or discard another user's edits", async () => {
    const id = error("contract.update", { id: "one" });
    localStorage.setItem("contribution_auth", JSON.stringify({ ...actor, role: "agent" }));
    expect(getSyncIssues(workspaceId)[0].actions).not.toContain("delete-server");
    localStorage.setItem("contribution_auth", JSON.stringify({ ...actor, id: "other" }));
    expect(getSyncIssues(workspaceId)[0].actions).toEqual(["retry"]);
    await expect(resolve(id, "ignore")).rejects.toThrow(/autorisée/); expect(getPendingOutbox()).toHaveLength(1);
  });

  it("rejects local deletion when the creation already reached the server", async () => {
    seed([contract("one")]); const id = error("contract.create", { ...contract("one") });
    await expect(resolve(id, "delete-local")).rejects.toThrow(/existe sur le serveur/);
    expect(getPendingOutbox()).toHaveLength(1);
  });

  it("retains a real rejection after retry rather than claiming it was resolved", async () => {
    const id = error("contract.update", { id: "one" }, "Dossier inaccessible");
    await expect(resolve(id, "retry")).rejects.toThrow("Dossier inaccessible");
    expect(getSyncIssues(workspaceId)[0].message).toBe("Dossier inaccessible");
  });

  it("preserves pending edits when server deletion fails", async () => {
    seed([contract("one")]); const id = error("contract.update", { id: "one" });
    mocks.remove.mockRejectedValue(new Error("La suppression est refusée"));
    await expect(resolve(id, "delete-server")).rejects.toThrow(/refusée/);
    expect(getPendingOutbox()).toHaveLength(1); expect(loadDb().contracts[0].deletedAt).toBeNull();
  });

  it("retries workspace errors through the workspace synchronizer", async () => {
    const db = loadDb(); db.syncMetadata[workspaceId] = { lastError: "Téléchargement interrompu" }; saveDb(db);
    await resolve("sync:workspace", "retry");
    expect(mocks.workspace).toHaveBeenCalledWith(workspaceId, { verify: true });
  });

  it("lists interrupted uploads with a retry action even without a row error message", () => {
    const item = queueOutbox(workspaceId, "contract.create", { ...contract("new") });
    setOutboxError(item.id, null, undefined, "temporary");
    expect(getSyncIssues(workspaceId)).toEqual([expect.objectContaining({ id: item.id, actions: ["retry"], message: "Connexion interrompue. Réessayez la synchronisation." })]);
  });

  it("continues synchronization when retrying successfully flushes and clears a storage error", async () => {
    let storageError: string | null = "Enregistrement interrompu";
    const storage = vi.spyOn(localDbModule, "getLocalStorageError").mockImplementation(() => storageError);
    const refresh = vi.spyOn(localDbModule, "refreshLocalDb").mockImplementation(async () => { storageError = null; });
    try {
      await resolve("sync:storage", "retry");
      expect(mocks.sync).toHaveBeenCalledOnce();
      expect(getSyncIssues(workspaceId)).toEqual([]);
    } finally { storage.mockRestore(); refresh.mockRestore(); }
  });
});
