import { deleteSyncResolutionContract, discardContractSyncChanges } from "./supabaseProvider";
import { cacheMinisters } from "../../features/settings/ministersCache";
import { LEGACY_MINISTER } from "../../lib/ministers";
import { isContractCorrection } from "../local/syncFailures";
import { queueOutbox, setOutboxError } from "../local/localOutbox";
import { loadDb } from "../local/localDb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateContractInput, Dossier, UpsertApplicantInput } from "../types";
import { createSupabaseProvider, syncSupabaseOutbox, syncSupabaseWorkspace, getSupabaseSyncState } from "./supabaseProvider";
import { cacheApplicant, cacheContracts, getPendingOutbox, isOfflineFailure, replaceWorkspaceCache, setWorkspaceSyncMetadata, upsertApplicantOffline } from "../local/offlineStore";
import { LocalContractRepository } from "../local/localContractRepository";
import { mutateContractListOffline } from "../local/localListRepository";

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mock.from, rpc: mock.rpc }) }));
const applicant: UpsertApplicantInput = {
  workspaceId: "workspace_default", gender: "Homme", firstName: "Jean", lastName: "LOUIS",
  nif: "123-456-789-0", ninu: null, address: "Delmas"
};
const input: CreateContractInput = {
  ...applicant, applicantId: applicant.nif ?? null, status: "saisie", position: "Analyste",
  assignment: "Planification", salaryNumber: 30000, salaryText: "trente mille", durationMonths: 12,
  annee_fiscale: "2025-2026"
};
function online(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}
function reply(data: unknown, error: unknown = null) {
  const chain: any = {};
  for (const method of ["select", "eq", "is", "in", "order", "limit", "insert", "upsert", "update", "ilike"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  chain.single = vi.fn(async () => ({ data, error }));
  chain.then = (resolve: any) => Promise.resolve({ data, error }).then(resolve);
  return chain;
}
function contractRow(id: string) {
  return { id_contrat: id, workspace_id: input.workspaceId, nif: input.applicantId, status: input.status,
    titre: input.position, lieu_affectation: input.assignment, salaire_en_chiffre: input.salaryNumber,
    salaire: input.salaryText, duree_contrat: input.durationMonths, annee_fiscale: input.annee_fiscale,
    created_at: "2026-09-16T10:00:00Z", identification: { prenom: "Jean", nom: "LOUIS", adresse: "Delmas", sexe: "Homme" } };
}
beforeEach(() => {
  localStorage.clear();
  cacheMinisters({ ministers: [LEGACY_MINISTER], currentMinisterId: LEGACY_MINISTER.id });
  mock.from.mockReset();
  mock.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  online(true);
});

describe("offline contract creation and replay", () => {
  it("uses the reviewed server version when deleting a synchronization conflict", async () => {
    const reviewed = { ...loadDb().contracts[0], id: "reviewed-contract", updatedAt: "2026-10-01T10:00:00Z",
      remoteUpdatedAt: "2026-10-01T10:00:00Z" };
    const deletion = reply(null);
    mock.from.mockReturnValue(deletion);

    await expect(deleteSyncResolutionContract(reviewed, "2026-10-02T10:00:00Z")).rejects.toThrow("Le contrat a changé");
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(deletion.update).toHaveBeenCalledWith(expect.objectContaining({
      deleted_at: "2026-10-02T10:00:00Z", modified_at: "2026-10-02T10:00:00Z"
    }));
    expect(deletion.eq).toHaveBeenCalledWith("updated_at", reviewed.remoteUpdatedAt);
    expect(deletion.eq).toHaveBeenCalledWith("workspace_id", reviewed.workspaceId);
    expect(deletion.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("replays later imports using a folder ID reconciled during a previous upload", async () => {
    const provider = createSupabaseProvider();
    const folder = await provider.dossiers.create({ workspaceId: input.workspaceId, name: "Import" });
    const first = await provider.contracts.create({ ...input, dossierId: folder.id });
    const folderRow = { id: "server-dossier", workspace_id: input.workspaceId, name: "Import", status: "active", created_at: "2026-01-01" };
    const firstInsert = reply([{ ...contractRow(first.id), dossier_id: "server-dossier" }]);
    mock.from.mockReturnValueOnce(reply(folderRow)).mockReturnValueOnce(reply(null))
      .mockReturnValueOnce(reply([])).mockReturnValueOnce(firstInsert);
    await syncSupabaseOutbox();
    expect(firstInsert.insert).toHaveBeenCalledWith([expect.objectContaining({ dossier_id: "server-dossier" })]);
    expect(getPendingOutbox()).toEqual([]);
    const second = await provider.contracts.create({ ...input, dossierId: folder.id, nif: "999-999-999-9", applicantId: "999-999-999-9" });
    setOutboxError(getPendingOutbox()[0].id, "Impossible de créer les contrats. Dossier inaccessible");
    const secondInsert = reply([{ ...contractRow(second.id), nif: second.nif, dossier_id: "server-dossier" }]);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(secondInsert);
    await syncSupabaseOutbox();
    expect(secondInsert.insert).toHaveBeenCalledWith([expect.objectContaining({ dossier_id: "server-dossier" })]);
    expect(getPendingOutbox()).toEqual([]);
    expect(await provider.contracts.getById(second.id)).toMatchObject({ dossierId: "server-dossier" });
  });

  it("still waits for an earlier rejected identity while uploading independent contracts", async () => {
    upsertApplicantOffline(applicant);
    const contracts = new LocalContractRepository();
    const dependent = await contracts.create(input);
    const independent = await contracts.create({ ...input, nif: "999-999-999-9", applicantId: "999-999-999-9" });
    const insertion = reply([{ ...contractRow(independent.id), nif: independent.nif }]);
    mock.from.mockReturnValueOnce(reply(null, { code: "23514", message: "Identité refusée" }))
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(insertion);
    await syncSupabaseOutbox();
    expect(insertion.insert).toHaveBeenCalledWith([expect.objectContaining({ id_contrat: independent.id })]);
    expect(getPendingOutbox()).toMatchObject([
      { type: "applicant.upsert", lastError: expect.stringContaining("Identité refusée") },
      { type: "contract.create", payload: { id: dependent.id }, failureKind: "dependency" }
    ]);
  });

  it("uploads a contract and its list before a later identity edit that is rejected", async () => {
    const user = { id: "author", name: "Author", username: "author", role: "admin" as const,
      workspaceId: input.workspaceId, taskSessionToken: "session" };
    localStorage.setItem("contribution_auth", JSON.stringify(user));
    const created = await new LocalContractRepository().create(input);
    const listId = await mutateContractListOffline(user, { action: "create", durationMonths: 12, contractIds: [created.id] });
    upsertApplicantOffline({ ...applicant, address: "Jacmel" });
    expect(getPendingOutbox().map(item => item.type)).toEqual(["contract.create", "list.operation", "applicant.upsert"]);
    const insertion = reply([contractRow(created.id)]);
    mock.from.mockImplementation(table => table === "identification"
      ? reply(null, { code: "23514", message: "Identité refusée" })
      : reply(null));
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(insertion);
    await syncSupabaseOutbox();
    expect(insertion.insert).toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith("sync_contract_list", expect.objectContaining({ p_operation: expect.objectContaining({ createId: listId }) }));
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ type: "applicant.upsert", lastError: expect.stringContaining("Identité refusée") })]);
  });

  it("replays the minister captured at creation even after the active minister changes", async () => {
    const successor = { ...LEGACY_MINISTER, id: "successor", fullName: "Marie TEST", gender: "Femme" as const, nif: "111-222-333-4", ninu: "1112223334" };
    cacheMinisters({ ministers: [LEGACY_MINISTER, successor], currentMinisterId: successor.id });
    online(false);
    const provider = createSupabaseProvider();
    const created = await provider.contracts.create(input);
    cacheMinisters({ ministers: [LEGACY_MINISTER, successor], currentMinisterId: LEGACY_MINISTER.id });
    expect(getPendingOutbox()[0].payload).toMatchObject({ ministerId: successor.id, minister: successor });
    online(true);
    const inserted = reply([{ ...contractRow(created.id), ministre_id: successor.id }]);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(inserted);
    await syncSupabaseOutbox();
    expect(inserted.insert).toHaveBeenCalledWith([expect.objectContaining({ ministre_id: successor.id })]);
    expect(getPendingOutbox()).toHaveLength(0);
    expect(loadDb().contracts.find(c => c.id === created.id)).toMatchObject({ ministerId: successor.id, minister: successor });
  });

  it("queues creation immediately even when online and rejects a second local duplicate", async () => {
    mock.from.mockImplementation(() => { throw new Error("Network must not be awaited"); });
    const provider = createSupabaseProvider();
    const created = await provider.contracts.create(input);
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ type: "contract.create", payload: expect.objectContaining({ id: created.id }) })]);
    await expect(provider.contracts.create(input)).rejects.toThrow(/existe déjà/);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("rechecks a recent snapshot after failure and clears its error on recovery", async () => {
    localStorage.setItem("contribution_auth", JSON.stringify({ workspaceId: input.workspaceId, taskSessionToken: "session" }));
    setWorkspaceSyncMetadata(input.workspaceId, {
      snapshotVersion: 1, lastFullSyncedAt: new Date().toISOString(), lastTrashSyncedAt: new Date().toISOString(), remoteRevision: "revision", lastError: "Failed to fetch"
    });
    mock.rpc.mockResolvedValue({ data: "revision", error: null });
    await syncSupabaseWorkspace(input.workspaceId);
    expect(mock.rpc).toHaveBeenCalledWith("get_offline_workspace_revision", expect.anything());
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
  });

  it("keeps network failures pending without marking valid data as rejected, then resumes", async () => {
    online(false);
    const created = await new LocalContractRepository().create(input);
    online(true);
    mock.from.mockReturnValue(reply(null, { message: "TypeError: Failed to fetch" }));
    await expect(syncSupabaseOutbox()).rejects.toThrow();
    expect(getPendingOutbox()).toHaveLength(1);
    expect(getPendingOutbox()[0].lastError).toBeFalsy();
    expect(getSupabaseSyncState(input.workspaceId).isSyncing).toBe(false);
    mock.from.mockReturnValue(reply(contractRow(created.id)));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toHaveLength(0);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
  });

  it("uploads an offline contract before the list that contains it", async () => {
    online(false);
    const user = { id: "offline-author", username: "author", name: "Author", role: "admin" as const,
      workspaceId: input.workspaceId, taskSessionToken: "test-session" };
    localStorage.setItem("contribution_auth", JSON.stringify(user));
    const created = await new LocalContractRepository().create(input);
    const listId = await mutateContractListOffline(user, { action: "create", durationMonths: 12, contractIds: [created.id] });
    expect(getPendingOutbox().map(item => item.type)).toEqual(["contract.create", "list.operation"]);
    online(true);
    mock.from.mockReturnValue(reply(contractRow(created.id)));
    await syncSupabaseOutbox();
    expect(mock.rpc).toHaveBeenCalledWith("sync_contract_list", expect.objectContaining({
      p_session_token: "test-session", p_operation: expect.objectContaining({ createId: listId, contractIds: [created.id] })
    }));
    expect(mock.from.mock.invocationCallOrder[0]).toBeLessThan(mock.rpc.mock.invocationCallOrder[0]);
    expect(getPendingOutbox()).toHaveLength(0);
  });

  it("keeps a queued list when another user has signed in", async () => {
    const user = { id: "original-author", username: "author", name: "Author", role: "admin" as const, workspaceId: input.workspaceId };
    await mutateContractListOffline(user, { action: "create", durationMonths: 6 });
    localStorage.setItem("contribution_auth", JSON.stringify({ ...user, id: "other-user", taskSessionToken: "other-session" }));
    await syncSupabaseOutbox();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toHaveLength(1);
    expect(getPendingOutbox()[0].lastError).toMatch(/compte/);
  });
  it("creates identity and printable contract without making a network request", async () => {
    online(false);
    const provider = createSupabaseProvider();
    const person = await provider.applicants.upsert(applicant);
    const contract = await provider.contracts.create({ ...input, applicantId: person.id });
    expect(await provider.contracts.getById(contract.id)).toMatchObject({ id: contract.id, firstName: "Jean" });
    expect(await provider.contracts.getByIds([contract.id], input.workspaceId)).toHaveLength(1);
    expect(getPendingOutbox().map((item) => item.type)).toEqual(["applicant.upsert", "contract.create"]);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("recognizes the plain error objects returned by Supabase on network failure", () => {
    expect(isOfflineFailure({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isOfflineFailure({ message: "duplicate key value", code: "23505" })).toBe(false);
  });

  it("keeps the original UUID if the insert response is lost and acknowledges replay without another insert", async () => {
    const provider = createSupabaseProvider();
    const created = await provider.contracts.create(input);
    expect(mock.from).not.toHaveBeenCalled();
    const failed = reply(null, { message: "TypeError: Failed to fetch" });
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(failed);
    await expect(syncSupabaseOutbox()).rejects.toThrow();
    expect(failed.insert.mock.calls[0][0][0].id_contrat).toBe(created.id);
    expect(failed.insert.mock.calls[0][0][0]).not.toHaveProperty("salaire");
    const remote = reply(contractRow(created.id));
    mock.from.mockReturnValue(remote);
    await syncSupabaseOutbox();
    expect(remote.insert).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toHaveLength(0);
  });

  it("reads a numeric-only cloud row and reconstructs the printable salary", async () => {
    const { salaire: _legacy, ...row } = contractRow("numeric-only");
    mock.from.mockReturnValue(reply({ ...row, salaire_en_chiffre: 45000.25 }));
    const contract = await createSupabaseProvider().contracts.getById("numeric-only");
    expect(contract?.salaryText).toBe("QUARANTE CINQ MILLE ET VINGT CINQ CENTIMES");
  });

  it("automatically updates the same UUID when its local edit is newer", async () => {
    const created = await new LocalContractRepository().create(input);
    const original = { ...contractRow(created.id), titre: "Directeur" };
    const update = reply(contractRow(created.id));
    mock.from.mockReturnValueOnce(reply(original)).mockReturnValueOnce(reply(original)).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ titre: "Analyste", modified_at: expect.any(String) }));
    expect(update.insert).not.toHaveBeenCalled();
    expect(await createSupabaseProvider().contracts.getById(created.id)).toMatchObject({ position: "Analyste" });
  });

  it("resolves an older remote identity and uploads the dependent contract", async () => {
    upsertApplicantOffline(applicant);
    const created = await new LocalContractRepository().create(input);
    const person = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Autre", nom: "LOUIS", sexe: "Homme", adresse: "Delmas", modified_at: "2026-01-01" };
    const update = reply({ ...person, prenom: "Jean" });
    mock.from.mockReturnValueOnce(reply([person])).mockReturnValueOnce(update)
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(reply([contractRow(created.id)]));
    await syncSupabaseOutbox();
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ prenom: "Jean" }));
    expect(getPendingOutbox()).toEqual([]);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
  });

  it("does not replace a pending local version during a cache refresh", async () => {
    const repo = new LocalContractRepository();
    const created = await repo.create(input);
    cacheContracts([{ ...created, position: "Remote" }]);
    expect(await repo.getById(created.id)).toMatchObject({ position: input.position });
  });

  it("moves a NINU to its newest local association without merging the NIF records", () => {
    upsertApplicantOffline({ ...applicant, ninu: "12345678901234" });
    upsertApplicantOffline({ ...applicant, nif: "999-999-999-9", ninu: "12345678901234" });
    expect(loadDb().applicants.find(person => person.nif === applicant.nif)?.ninu).toBeNull();
    expect(loadDb().applicants.find(person => person.nif === "999-999-999-9")?.ninu).toBe("12345678901234");
  });

  it("replaces a pending identity correction before dependent contracts without overwriting the server", async () => {
    upsertApplicantOffline(applicant);
    const originalQueueId = getPendingOutbox()[0].id;
    await new LocalContractRepository().create(input);
    await createSupabaseProvider().applicants.upsert({ ...applicant, firstName: "Pierre" });
    const pending = getPendingOutbox();
    expect(pending).toHaveLength(2);
    expect(pending[0].id).not.toBe(originalQueueId);
    expect(pending[0].payload.firstName).toBe("Pierre");
    expect(pending[1].type).toBe("contract.create");
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("synchronizes a new identity before its contract and drains the queue", async () => {
    upsertApplicantOffline(applicant);
    const created = await new LocalContractRepository().create(input);
    const personRow = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Jean", nom: "LOUIS", sexe: "Homme", adresse: "Delmas" };
    const insertPerson = reply(personRow);
    const insertContract = reply([contractRow(created.id)]);
    mock.from.mockReturnValueOnce(reply([])).mockReturnValueOnce(insertPerson)
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(insertContract);
    await syncSupabaseOutbox();
    expect(mock.from.mock.calls.map(([table]) => table)).toEqual(["identification", "identification", "contrat", "contrat", "contrat"]);
    expect(insertContract.insert.mock.calls[0][0][0].id_contrat).toBe(created.id);
    expect(getPendingOutbox()).toHaveLength(0);
  });
});

describe("offline status changes", () => {
  it("uploads only fields changed offline and checks the remote version", async () => {
    const provider = createSupabaseProvider();
    const row = { ...contractRow("editable"), updated_at: "2026-09-16T10:00:00Z" };
    mock.from.mockReturnValue(reply(row));
    const original = (await provider.contracts.getById("editable"))!;
    online(false);
    await provider.contracts.update({ ...original, commentaire: "Local note" });
    online(true);
    const current = { ...row, salaire_en_chiffre: 45000, updated_at: "2026-09-17T10:00:00Z" };
    const update = reply({ ...current, commentaire: "Local note" });
    mock.from.mockReset().mockReturnValueOnce(reply(current)).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(update.update.mock.calls[0][0]).toMatchObject({ commentaire: "Local note" });
    expect(update.update.mock.calls[0][0]).not.toHaveProperty("salaire_en_chiffre");
    expect(update.eq).toHaveBeenCalledWith("updated_at", current.updated_at);
    expect(getPendingOutbox()).toEqual([]);
  });

  it("keeps a newer remote salary and acknowledges the older local edit", async () => {
    const provider = createSupabaseProvider();
    const row = contractRow("editable");
    mock.from.mockReturnValue(reply(row));
    await provider.contracts.getById("editable");
    await provider.contracts.update({ id: "editable", salaryNumber: 35000 });
    const modifiedAt = new Date(Date.parse(getPendingOutbox()[0].modifiedAt!) + 1000).toISOString();
    const read = reply({ ...row, salaire_en_chiffre: 45000, modified_at: modifiedAt });
    mock.from.mockReset().mockReturnValue(read);
    await syncSupabaseOutbox();
    expect(read.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(await provider.contracts.getById("editable")).toMatchObject({ salaryNumber: 45000 });
  });
  function seed(id = "existing") {
    cacheContracts([{ ...input, salaryText: "TRENTE MILLE", id, createdAt: "2026-09-16T10:00:00Z", updatedAt: "2026-09-16T10:00:00Z" }]);
    return id;
  }

  it("changes cached contracts offline, queues only changed accessible IDs and persists the state", async () => {
    const first = seed();
    const second = seed("second");
    online(false);
    const provider = createSupabaseProvider();
    expect(await provider.contracts.updateStatus(input.workspaceId, [first, second, "missing"], "signe")).toBe(2);
    expect(mock.from).not.toHaveBeenCalled();
    expect((await provider.contracts.getByIds([first, second], input.workspaceId)).every((c) => c.status === "signe")).toBe(true);
    const queued = getPendingOutbox();
    expect(queued.map((item) => item.payload)).toEqual([
      expect.objectContaining({ contractIds: [first], status: "signe", previousStatus: "saisie" }),
      expect.objectContaining({ contractIds: [second], status: "signe", previousStatus: "saisie" })
    ]);
    expect(await provider.contracts.updateStatus(input.workspaceId, [first], "signe")).toBe(0);
    expect(getPendingOutbox()).toHaveLength(2);
    const persisted = JSON.parse(localStorage.getItem("contribution_local_db")!);
    expect(persisted.contracts.find((c: any) => c.id === first).status).toBe("signe");
  });

  it("replays the transition with atomic state and version conditions", async () => {
    const id = seed();
    await new LocalContractRepository().updateStatus(input.workspaceId, [id], "imprime");
    const update = reply({ ...contractRow(id), status: "imprime" });
    mock.from.mockReturnValueOnce(reply(contractRow(id))).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(update.eq).toHaveBeenCalledWith("status", "saisie");
    expect(update.is).toHaveBeenCalledWith("updated_at", null);
    expect(update.update.mock.calls[0][0].status).toBe("imprime");
    expect(getPendingOutbox()).toHaveLength(0);
    expect(await new LocalContractRepository().getById(id)).toMatchObject({ status: "imprime" });
  });

  it("keeps the newest remote state and removes the obsolete queued transition", async () => {
    const id = seed();
    await new LocalContractRepository().updateStatus(input.workspaceId, [id], "imprime");
    const modifiedAt = new Date(Date.parse(getPendingOutbox()[0].modifiedAt!) + 1000).toISOString();
    const remote = reply({ ...contractRow(id), status: "signe", modified_at: modifiedAt });
    mock.from.mockReturnValue(remote);
    await syncSupabaseOutbox();
    expect(remote.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
    expect(await createSupabaseProvider().contracts.getById(id)).toMatchObject({ status: "signe" });
  });

  it("retains the operation if another writer wins between reading and updating", async () => {
    const id = seed();
    await new LocalContractRepository().updateStatus(input.workspaceId, [id], "imprime");
    mock.from.mockReturnValueOnce(reply(contractRow(id))).mockReturnValueOnce(reply(null));
    await expect(syncSupabaseOutbox()).rejects.toThrow("pendant la synchronisation");
    expect(getPendingOutbox()).toHaveLength(1);
    expect(getPendingOutbox()[0]).toMatchObject({ failureKind: "temporary", lastError: null });
  });

  it("acknowledges an already applied transition without repeating it", async () => {
    const id = seed();
    await new LocalContractRepository().updateStatus(input.workspaceId, [id], "imprime");
    const remote = reply({ ...contractRow(id), status: "imprime" });
    mock.from.mockReturnValue(remote);
    await syncSupabaseOutbox();
    expect(remote.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toHaveLength(0);
  });

  it("preserves the order of successive offline transitions", async () => {
    const id = seed();
    const repo = new LocalContractRepository();
    await repo.updateStatus(input.workspaceId, [id], "imprime");
    await repo.updateStatus(input.workspaceId, [id], "signe");
    const printed = { ...contractRow(id), status: "imprime" };
    const signed = { ...contractRow(id), status: "signe" };
    const firstUpdate = reply(printed);
    const secondUpdate = reply(signed);
    mock.from.mockReturnValueOnce(reply(contractRow(id))).mockReturnValueOnce(firstUpdate)
      .mockReturnValueOnce(reply(printed)).mockReturnValueOnce(secondUpdate);
    await syncSupabaseOutbox();
    expect(secondUpdate.eq).toHaveBeenCalledWith("status", "imprime");
    expect(getPendingOutbox()).toHaveLength(0);
    expect(await repo.getById(id)).toMatchObject({ status: "signe" });
  });

  it("creates an offline contract before applying its new state", async () => {
    const repo = new LocalContractRepository();
    const contract = await repo.create(input);
    await repo.updateStatus(input.workspaceId, [contract.id], "imprime");
    const original = contractRow(contract.id);
    const update = reply({ ...original, status: "imprime" });
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(reply([original]))
      .mockReturnValueOnce(reply(original)).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(update.update.mock.calls[0][0].status).toBe("imprime");
    expect(getPendingOutbox()).toHaveLength(0);
    expect(await repo.getById(contract.id)).toMatchObject({ status: "imprime" });
  });
});


describe("sync recovery", () => {
  it.each([false, true])('synchronizes a new tag and its assignment with insert-only permissions (lost reply: %s)', async loseReply => {
    const provider = createSupabaseProvider();
    cacheContracts([{ ...input, salaryText: 'TRENTE MILLE', id: 'tagged-contract', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]);
    const tag = await provider.tags.create({ workspaceId: input.workspaceId, name: 'Nouveau tag' });
    await provider.tags.assignToContract(input.workspaceId, 'tagged-contract', tag.id);
    let savedTag: unknown = null;
    const links = new Set<string>();
    let lostReply = false;
    mock.from.mockImplementation(table => {
      const chain = reply(savedTag);
      if (table === 'tags') {
        chain.insert.mockImplementation((payload: Record<string, unknown>) => {
          savedTag = { ...payload, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null };
          return reply(savedTag);
        });
      } else if (table === 'contract_tags') {
        chain.upsert.mockImplementation((payload: { contract_id: string; tag_id: string }, options?: { ignoreDuplicates?: boolean }) => {
          if (!options?.ignoreDuplicates) return reply(null, { code: '42501', message: 'permission denied for table contract_tags' });
          links.add(`${payload.contract_id}:${payload.tag_id}`);
          if (loseReply && !lostReply) {
            lostReply = true;
            return reply(null, { message: 'Failed to fetch' });
          }
          return reply(null);
        });
      } else throw new Error(`Unexpected table ${table}`);
      return chain;
    });
    if (loseReply) {
      await expect(syncSupabaseOutbox()).rejects.toThrow(/ajouter le tag/);
      expect(getPendingOutbox()).toMatchObject([{ type: 'tag.assign', failureKind: 'temporary' }]);
    }
    await syncSupabaseOutbox();
    expect(savedTag).toMatchObject({ id: tag.id, name: 'Nouveau tag' });
    expect(links).toEqual(new Set([`tagged-contract:${tag.id}`]));
    expect(getPendingOutbox()).toEqual([]);
    expect((await provider.contracts.getById('tagged-contract'))!.tags).toMatchObject([{ id: tag.id }]);
  });

  it.each([
    { code: '40001', message: 'could not serialize access due to concurrent update' },
    { code: '40P01', message: 'deadlock detected' },
    { code: '55P03', message: 'could not obtain lock on row' }
  ])('keeps PostgreSQL contention temporary when replaying a list: $code', async error => {
    const user = { id: 'author', name: 'Author', username: 'author', role: 'admin' as const,
      workspaceId: input.workspaceId, taskSessionToken: 'session' };
    localStorage.setItem('contribution_auth', JSON.stringify(user));
    await mutateContractListOffline(user, { action: 'create', durationMonths: 12 });
    const requestId = getPendingOutbox()[0].id;
    mock.rpc.mockResolvedValue({ data: null, error });
    await expect(syncSupabaseOutbox()).rejects.toEqual(error);
    expect(getPendingOutbox()[0].lastError).toBeFalsy();
    expect(getPendingOutbox()[0].failureKind).toBe('temporary');
    mock.rpc.mockResolvedValue({ data: null, error: null });
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
    expect(mock.rpc.mock.calls.map(call => call[1].p_request_id)).toEqual([requestId, requestId]);
  });
  it("keeps a failed dossier's contracts pending while synchronizing another dossier's contract", async () => {
    queueOutbox(input.workspaceId, "dossier.create", { id: "failed-dossier", workspaceId: input.workspaceId, name: "Failed" });
    const dependent = await new LocalContractRepository().create({ ...input, dossierId: "failed-dossier" });
    const independent = await new LocalContractRepository().create({ ...input, dossierId: "other-dossier", nif: "999-999-999-9", applicantId: "999-999-999-9" });
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply(null, { code: "23514", message: "Dossier refusé" }))
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([]))
      .mockReturnValueOnce(reply([{ ...contractRow(independent.id), nif: independent.nif, dossier_id: "other-dossier" }]));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toHaveLength(2);
    expect(getPendingOutbox()[1]).toMatchObject({ payload: { id: dependent.id }, failureKind: "dependency" });
  });

  it("isolates a failed pin without skipping later toggles of that pin", async () => {
    localStorage.setItem("contribution_auth", JSON.stringify({ id: "author", workspaceId: input.workspaceId, taskSessionToken: "session" }));
    queueOutbox(input.workspaceId, "pin.set", { userId: "author", contractId: "rejected", pinned: true });
    queueOutbox(input.workspaceId, "pin.set", { userId: "author", contractId: "rejected", pinned: false });
    queueOutbox(input.workspaceId, "pin.set", { userId: "author", contractId: "independent", pinned: true });
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "Contrat introuvable" } })
      .mockResolvedValue({ data: ["independent"], error: null });
    await syncSupabaseOutbox();
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.rpc).toHaveBeenLastCalledWith("set_pinned_contract", expect.objectContaining({ p_contract_id: "independent" }));
    expect(getPendingOutbox()).toHaveLength(2);
    expect(getPendingOutbox()[1].failureKind).toBe("dependency");
  });

  it("isolates a rejected contract from other contracts in the same dossier and identity", async () => {
    const repo = new LocalContractRepository();
    const rejected = await repo.create({ ...input, dossierId: "shared-dossier" });
    const independent = await repo.create({ ...input, dossierId: "shared-dossier", annee_fiscale: "2026-2027" });
    mock.from.mockReturnValueOnce(reply(null, { code: "23514", message: "Contrat refusé" }))
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([]))
      .mockReturnValueOnce(reply([{ ...contractRow(independent.id), dossier_id: "shared-dossier", annee_fiscale: "2026-2027" }]));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ payload: expect.objectContaining({ id: rejected.id }), lastError: expect.stringContaining("Contrat refusé") })]);
  });

  it("blocks the rejected contract's list without blocking an independent list", async () => {
    const user = { id: "author", name: "Author", username: "author", role: "admin" as const,
      workspaceId: input.workspaceId, taskSessionToken: "session" };
    localStorage.setItem("contribution_auth", JSON.stringify(user));
    const rejected = await new LocalContractRepository().create(input);
    const dependent = await mutateContractListOffline(user, { action: "create", durationMonths: 12, contractIds: [rejected.id] });
    const independent = await mutateContractListOffline(user, { action: "create", durationMonths: 6 });
    mock.from.mockReturnValue(reply(null, { code: "23514", message: "Contrat refusé" }));
    await syncSupabaseOutbox();
    expect(mock.rpc).toHaveBeenCalledWith("sync_contract_list", expect.objectContaining({
      p_operation: expect.objectContaining({ createId: independent })
    }));
    expect(getPendingOutbox()).toHaveLength(2);
    expect(getPendingOutbox()[1]).toMatchObject({ payload: { operation: { createId: dependent } }, failureKind: "dependency" });
  });

  it("does not propagate a rejected tag assignment through a shared tag", async () => {
    queueOutbox(input.workspaceId, "tag.assign", { contractId: "rejected", tagId: "shared" });
    queueOutbox(input.workspaceId, "tag.remove", { contractId: "rejected", tagId: "shared" });
    queueOutbox(input.workspaceId, "tag.assign", { contractId: "independent", tagId: "shared" });
    const saved = reply(null);
    mock.from.mockReturnValueOnce(reply(null, { code: "23514", message: "Affectation refusée" })).mockReturnValue(saved);
    await syncSupabaseOutbox();
    expect(saved.upsert).toHaveBeenCalledWith({ contract_id: "independent", tag_id: "shared" }, {
      onConflict: "contract_id,tag_id", ignoreDuplicates: true
    });
    expect(getPendingOutbox()).toHaveLength(2);
    expect(getPendingOutbox()[1].failureKind).toBe("dependency");
  });

  it("keeps the newer remote identity while continuing both dependent and unrelated contracts", async () => {
    upsertApplicantOffline(applicant);
    const dependent = await new LocalContractRepository().create(input);
    const independent = await new LocalContractRepository().create({ ...input, nif: "999-999-999-9", applicantId: "999-999-999-9" });
    const modifiedAt = new Date(Date.parse(getPendingOutbox()[0].modifiedAt!) + 1000).toISOString();
    const person = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Pierre", nom: "LOUIS", sexe: "Homme", adresse: "Delmas", modified_at: modifiedAt };
    mock.from.mockReturnValueOnce(reply([person])).mockReturnValueOnce(reply(null))
      .mockReturnValueOnce(reply([])).mockReturnValueOnce(reply([{ ...contractRow(dependent.id), identification: person }]))
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([]))
      .mockReturnValueOnce(reply([{ ...contractRow(independent.id), nif: independent.nif }]));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
    expect(await new LocalContractRepository().getById(dependent.id)).toMatchObject({ firstName: "Pierre" });
  });

  it("merges an offline identity edit when the server has not changed that field", async () => {
    const timestamp = "2026-09-16T10:00:00Z";
    cacheApplicant({ ...applicant, id: applicant.nif!, createdAt: timestamp, updatedAt: timestamp });
    upsertApplicantOffline({ ...applicant, address: "Jacmel" });
    const row = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Jean", nom: "LOUIS", sexe: "Homme", adresse: "Delmas", updated_at: timestamp };
    const update = reply({ ...row, adresse: "Jacmel" });
    mock.from.mockReturnValueOnce(reply([row])).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(update.update.mock.calls[0][0].adresse).toBe("Jacmel");
    expect(update.eq).toHaveBeenCalledWith("updated_at", timestamp);
    expect(getPendingOutbox()).toHaveLength(0);
  });

  it("ignores an imported creation when the same NIF/year was created on the cloud while offline", async () => {
    const contract = await new LocalContractRepository().create({ ...input, skipFiscalYearDuplicate: true });
    const duplicates = reply([contractRow("another-device")]);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(duplicates);
    await syncSupabaseOutbox();
    expect(duplicates.insert).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().contracts.find(item => item.id === contract.id)).toBeUndefined();
    expect(loadDb().contracts.find(item => item.id === "another-device")).toBeDefined();
    expect(loadDb().outbox.find(item => item.payload.id === contract.id)).toMatchObject({ skippedDuplicateId: "another-device", lastError: null, syncedAt: expect.any(String) });
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
  });

  it("ignores the imported identity changes too when the cloud already has the contract", async () => {
    upsertApplicantOffline({ ...applicant, firstName: "Nouveau", address: "Jacmel", importContractId: "duplicate-import" });
    await new LocalContractRepository().create({ ...input, id: "duplicate-import", skipFiscalYearDuplicate: true });
    const identity = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Jean", nom: "LOUIS", sexe: "Homme", adresse: "Delmas", created_at: "2026-01-01" };
    const originalIdentity = reply(identity);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([contractRow("server-existing")]))
      .mockReturnValueOnce(originalIdentity);
    await syncSupabaseOutbox();
    expect(originalIdentity.update).not.toHaveBeenCalled();
    expect(originalIdentity.insert).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().contracts.some(c => c.id === "duplicate-import")).toBe(false);
    expect(loadDb().applicants.find(a => a.nif === applicant.nif)).toMatchObject({ firstName: "Jean", address: "Delmas" });
  });

  it("waits for an import's contract to be queued before uploading its identity, then completes both", async () => {
    localStorage.setItem(`contract_import_request:${input.workspaceId}:in-progress`, JSON.stringify({ ...input, id: "in-progress" }));
    upsertApplicantOffline({ ...applicant, importContractId: "in-progress" });
    await syncSupabaseOutbox();
    expect(mock.from).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toMatchObject([{ type: "applicant.upsert" }]);
    await new LocalContractRepository().create({ ...input, id: "in-progress", skipFiscalYearDuplicate: true });
    const identity = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Jean", nom: "LOUIS", sexe: "Homme", adresse: "Delmas" };
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([]))
      .mockReturnValueOnce(reply([])).mockReturnValueOnce(reply(identity))
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(reply([contractRow("in-progress")]));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
  });

  it("does not leave an abandoned import's identity waiting forever", async () => {
    upsertApplicantOffline({ ...applicant, importContractId: "abandoned" });
    setWorkspaceSyncMetadata(input.workspaceId, { lastError: "Ancienne erreur" });
    await syncSupabaseOutbox();
    expect(mock.from).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
  });

  it("keeps a manual creation visible for correction when it collides with a cloud contract", async () => {
    const contract = await new LocalContractRepository().create(input);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([contractRow("another-device")]));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toMatchObject([{ payload: { id: contract.id }, lastError: expect.stringContaining("existe déjà") }]);
    expect(loadDb().contracts.some(item => item.id === contract.id)).toBe(true);
  });

  it("recovers an older blocked import, continues the other contracts and excludes its references from queued lists", async () => {
    const user = { id: "author", name: "Author", username: "author", role: "admin" as const,
      workspaceId: input.workspaceId, taskSessionToken: "session" };
    localStorage.setItem("contribution_auth", JSON.stringify(user));
    const repo = new LocalContractRepository();
    const duplicate = await repo.create(input);
    const independent = await repo.create({ ...input, nif: "999-999-999-9", applicantId: "999-999-999-9" });
    localStorage.setItem(`contract_import_batch:${input.workspaceId}:author:old-batch`, JSON.stringify({
      workspaceId: input.workspaceId, userId: "author", entries: [{ before: null, after: duplicate }]
    }));
    setOutboxError(getPendingOutbox()[0].id, "Un contrat existe déjà pour le NIF dans l’année fiscale.");
    const listId = await mutateContractListOffline(user, { action: "create", durationMonths: 12, contractIds: [duplicate.id, independent.id] });
    await mutateContractListOffline(user, { action: "visa", listId: listId!, visaNumber: "V-1", version: loadDb().contractLists.find(list => list.id === listId)!.version });
    queueOutbox(input.workspaceId, "tag.assign", { contractId: duplicate.id, tagId: "tag" });
    const insertion = reply([{ ...contractRow(independent.id), nif: independent.nif }]);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([contractRow("server-existing")]))
      .mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(insertion);
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
    expect(insertion.insert).toHaveBeenCalledWith([expect.objectContaining({ id_contrat: independent.id })]);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.rpc.mock.calls[0][1]).toMatchObject({ p_operation: { contractIds: [independent.id] }, p_expected_memberships: { [independent.id]: null } });
    expect(mock.rpc.mock.calls[0][1].p_expected_memberships).not.toHaveProperty(duplicate.id);
    expect(mock.rpc.mock.calls[1][1].p_expected_lists[listId!].members.map((member: { id: string }) => member.id)).toEqual([independent.id]);
    expect(loadDb().contractLists.find(list => list.id === listId)?.members.map(member => member.id)).toEqual([independent.id]);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toBeNull();
    await syncSupabaseOutbox();
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });

  it("continues to report an unrelated server rejection for an imported creation", async () => {
    const contract = await new LocalContractRepository().create({ ...input, skipFiscalYearDuplicate: true });
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([]))
      .mockReturnValueOnce(reply(null, { code: "42501", message: "Dossier inaccessible" }));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toMatchObject([{ payload: { id: contract.id }, lastError: expect.stringContaining("Dossier inaccessible") }]);
  });
});

describe("discard pending contract edits", () => {
  it("restores the server version and preserves other contracts in a batch", async () => {
    mock.from.mockReturnValue(reply(contractRow("editable")));
    const contract = await createSupabaseProvider().contracts.getById("editable");
    expect(contract).not.toBeNull();
    const queued = queueOutbox(input.workspaceId, "contract.update", { contractIds: ["editable", "other"], status: "imprime" });
    await discardContractSyncChanges(contract!, [queued.id]);
    expect(getPendingOutbox().find(item => item.id === queued.id)?.payload.contractIds).toEqual(["other"]);
    expect(loadDb().contracts.find(item => item.id === "editable")?.status).toBe("saisie");
  });
  it("keeps pending edits when the server cannot be read", async () => {
    mock.from.mockReturnValue(reply(contractRow("editable")));
    const contract = await createSupabaseProvider().contracts.getById("editable");
    const queued = queueOutbox(input.workspaceId, "contract.update", { id: "editable", position: "Local" });
    mock.from.mockReturnValue(reply(null, { message: "Network unavailable" }));
    await expect(discardContractSyncChanges(contract!, [queued.id])).rejects.toThrow();
    expect(getPendingOutbox().some(item => item.id === queued.id)).toBe(true);
  });
  it("refuses to discard edits added after the confirmation was opened", async () => {
    mock.from.mockReturnValue(reply(contractRow("editable")));
    const contract = await createSupabaseProvider().contracts.getById("editable");
    const first = queueOutbox(input.workspaceId, "contract.update", { id: "editable", position: "Local" });
    queueOutbox(input.workspaceId, "contract.update", { id: "editable", commentaire: "New edit" });
    await expect(discardContractSyncChanges(contract!, [first.id])).rejects.toThrow("modifications ont changé");
    expect(getPendingOutbox()).toHaveLength(2);
  });
});


describe("local-first operations with Internet available", () => {
  it("serves filters, pagination, details and empty results from a complete snapshot without network calls", async () => {
    const provider = createSupabaseProvider();
    const person = { ...applicant, id: applicant.nif!, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
    const contract = { ...input, salaryText: "TRENTE MILLE", id: "cached", createdAt: "2026-09-01", updatedAt: "2026-09-01" };
    replaceWorkspaceCache(input.workspaceId, { applicants: [person], contracts: [contract], dossiers: [], tags: [] });
    setWorkspaceSyncMetadata(input.workspaceId, { lastFullSyncedAt: "2026-09-01" });
    mock.from.mockImplementation(() => { throw new Error("Network must not be awaited"); });
    expect((await provider.contracts.list({ workspaceId: input.workspaceId, query: "Jean", pageSize: 1 })).items).toHaveLength(1);
    expect((await provider.contracts.list({ workspaceId: input.workspaceId, query: "absent" })).total).toBe(0);
    expect(await provider.contracts.getById("cached")).toMatchObject({ id: "cached" });
    expect(await provider.contracts.getByIds(["cached"], input.workspaceId)).toHaveLength(1);
    expect(await provider.applicants.list(input.workspaceId)).toHaveLength(1);
    expect(await provider.applicants.findByNifOrNinu(input.workspaceId, "absent")).toBeNull();
    expect(await provider.applicants.findManyByNifOrNinu(input.workspaceId, [applicant.nif!], [])).toHaveLength(1);
    expect(await provider.dossiers.list(input.workspaceId)).toEqual([]);
    expect(await provider.tags.list(input.workspaceId)).toEqual([]);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("persists online edits, bulk actions, dossiers, tags and deletions before any network work", async () => {
    const provider = createSupabaseProvider();
    mock.from.mockImplementation(() => { throw new Error("Network must not be awaited"); });
    const person = await provider.applicants.upsert(applicant);
    const [contract] = await provider.contracts.createMany([{ ...input, applicantId: person.id }]);
    const dossier = await provider.dossiers.create({ workspaceId: input.workspaceId, name: "Local" });
    await provider.dossiers.update({ id: dossier.id, workspaceId: input.workspaceId, name: "Corrigé" });
    await provider.contracts.assignToDossier(input.workspaceId, [contract.id], dossier.id);
    await provider.contracts.updateDuration(input.workspaceId, [contract.id], 6);
    await provider.contracts.update({ id: contract.id, commentaire: "Immédiat" });
    const tag = await provider.tags.create({ workspaceId: input.workspaceId, name: "Priorité" });
    await provider.tags.assignToContract(input.workspaceId, contract.id, tag.id);
    expect(await provider.contracts.getById(contract.id)).toMatchObject({ durationMonths: 6, commentaire: "Immédiat", tags: [expect.objectContaining({ id: tag.id })] });
    await provider.tags.removeFromContract(input.workspaceId, contract.id, tag.id);
    await provider.dossiers.delete(dossier.id, input.workspaceId);
    expect(await provider.dossiers.getById(dossier.id)).toBeNull();
    await provider.contracts.softDelete(contract.id, input.workspaceId);
    await provider.applicants.softDelete(person.id, input.workspaceId);
    expect(await provider.applicants.getById(person.id)).toBeNull();
    expect(getPendingOutbox().map(item => item.type)).toEqual(expect.arrayContaining([
      "applicant.upsert", "contract.create", "dossier.create", "dossier.update", "contract.update",
      "tag.create", "tag.assign", "tag.remove", "dossier.delete", "contract.delete", "applicant.delete"
    ]));
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("preserves identity edits and dossier detachments while a server snapshot arrives", async () => {
    const provider = createSupabaseProvider();
    const person = { ...applicant, id: applicant.nif!, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
    const dossier: Dossier = {
      id: "folder", workspaceId: input.workspaceId, name: "Dossier", status: "active",
      isEphemeral: false, priority: "normal", contractTargetCount: 0,
      createdAt: "2026-09-01", updatedAt: "2026-09-01"
    };
    const contract = { ...input, salaryText: "TRENTE MILLE", id: "cached", dossierId: dossier.id, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
    const snapshot = { applicants: [person], contracts: [contract], dossiers: [dossier], tags: [] };
    replaceWorkspaceCache(input.workspaceId, snapshot);
    await provider.applicants.upsert({ ...applicant, id: person.id, address: "Jacmel" });
    await provider.dossiers.delete(dossier.id, input.workspaceId);
    replaceWorkspaceCache(input.workspaceId, snapshot);
    cacheContracts([contract]);
    expect(await provider.contracts.getById(contract.id)).toMatchObject({ address: "Jacmel", dossierId: null });
  });

  it("replays a personal pin only with its author's session", async () => {
    const user = { id: "pin-user", workspaceId: input.workspaceId, taskSessionToken: "pin-session" };
    localStorage.setItem("contribution_auth", JSON.stringify(user));
    queueOutbox(input.workspaceId, "pin.set", { userId: user.id, contractId: "cached", pinned: true });
    mock.rpc.mockResolvedValue({ data: ["cached"], error: null });
    await syncSupabaseOutbox();
    expect(mock.rpc).toHaveBeenCalledWith("set_pinned_contract", {
      p_session_token: user.taskSessionToken, p_contract_id: "cached", p_pinned: true
    });
    expect(getPendingOutbox()).toEqual([]);
    expect(JSON.parse(localStorage.getItem("contribution_pinned_contracts:pin-user")!)).toEqual(["cached"]);
  });
});


describe("contract correction replay", () => {
  it("repairs a rejected creation in place and removes the correction only on ACK", async () => {
    const provider = createSupabaseProvider();
    const created = await provider.contracts.create(input);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([]))
      .mockReturnValueOnce(reply(null, { code: "23514", message: "Salaire hors grille" }));
    await syncSupabaseOutbox();
    const rejected = getPendingOutbox()[0];
    expect(rejected).toMatchObject({ failureKind: "correction", correctionPending: true });
    expect(rejected.lastError).toContain("Salaire hors grille");
    await provider.contracts.update({ id: created.id, salaryNumber: 45000 });
    const pending = getPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: "contract.create", lastError: null, correctionPending: true, payload: { id: created.id, salaryNumber: 45000 } });
    expect(pending[0].id).not.toBe(rejected.id);
    expect(isContractCorrection(pending[0], created)).toBe(true);
    const insert = reply([{ ...contractRow(created.id), salaire_en_chiffre: 45000 }]);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(reply([])).mockReturnValueOnce(insert);
    await syncSupabaseOutbox();
    expect(insert.insert).toHaveBeenCalledWith([expect.objectContaining({ id_contrat: created.id, salaire_en_chiffre: 45000 })]);
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().contracts.filter(contract => contract.id === created.id)).toHaveLength(1);
  });

  it.each([{ status: 503, message: "Service unavailable" }, { code: "40001", message: "serialization failure" }, { status: 429, message: "Too many requests" }])("retries a temporary failure without requiring correction: %j", async error => {
    const created = await new LocalContractRepository().create(input);
    mock.from.mockReturnValue(reply(null, error));
    await expect(syncSupabaseOutbox()).rejects.toThrow();
    expect(getPendingOutbox()[0].lastError).toBeNull();
    expect(isContractCorrection(getPendingOutbox()[0], created)).toBe(false);
    mock.from.mockReturnValue(reply(contractRow(created.id)));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
  });

  it("corrects an already committed creation without inserting a duplicate", async () => {
    const repo = new LocalContractRepository();
    const created = await repo.create(input);
    setOutboxError(getPendingOutbox()[0].id, "Salaire hors grille");
    await repo.update({ id: created.id, salaryNumber: 45000 });
    const updated = reply({ ...contractRow(created.id), salaire_en_chiffre: 45000 });
    mock.from.mockReturnValueOnce(reply(contractRow(created.id))).mockReturnValueOnce(reply(contractRow(created.id)))
      .mockReturnValueOnce(updated);
    await syncSupabaseOutbox();
    expect(updated.insert).not.toHaveBeenCalled();
    expect(updated.update).toHaveBeenCalledWith(expect.objectContaining({ salaire_en_chiffre: 45000 }));
    expect(getPendingOutbox()).toEqual([]);
  });

  it("keeps a correction when an older request completes while the user edits", async () => {
    const repo = new LocalContractRepository();
    const created = await repo.create(input);
    setOutboxError(getPendingOutbox()[0].id, "Salaire hors grille");
    const remote = reply(contractRow(created.id));
    let release!: () => void;
    remote.maybeSingle.mockImplementation(() => new Promise(resolve => { release = () => resolve({ data: contractRow(created.id), error: null }); }));
    mock.from.mockReturnValue(remote);
    const syncing = syncSupabaseOutbox();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await repo.update({ id: created.id, salaryNumber: 45000 });
    release();
    await syncing;
    expect(getPendingOutbox()).toHaveLength(1);
    expect((await repo.getById(created.id))?.salaryNumber).toBe(45000);
    expect(getPendingOutbox()[0].payload.salaryNumber).toBe(45000);
  });

  it("repairs a failed update against its original server base", async () => {
    const provider = createSupabaseProvider();
    mock.from.mockReturnValue(reply(contractRow("existing")));
    await provider.contracts.getById("existing");
    await provider.contracts.update({ id: "existing", salaryNumber: 35000 });
    const original = getPendingOutbox()[0];
    setOutboxError(original.id, "Salaire hors grille");
    await provider.contracts.update({ id: "existing", salaryNumber: 45000 });
    expect(getPendingOutbox()).toHaveLength(1);
    expect(getPendingOutbox()[0].payload.baseContract).toMatchObject({ salaryNumber: 30000 });
    const updated = reply({ ...contractRow("existing"), salaire_en_chiffre: 45000 });
    mock.from.mockReturnValueOnce(reply(contractRow("existing"))).mockReturnValueOnce(updated);
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
  });

  it("automatically retries an identity conflict saved by an older app version", async () => {
    const provider = createSupabaseProvider();
    const person = await provider.applicants.upsert(applicant);
    const created = await provider.contracts.create({ ...input, applicantId: person.id });
    const identity = getPendingOutbox()[0];
    setOutboxError(identity.id, "Conflit d'identification", { fields: ["firstName"], remote: { firstName: "Pierre" } }, "correction");
    const remotePerson = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Pierre", nom: "LOUIS", sexe: "Homme", adresse: "Delmas", modified_at: "2026-01-01" };
    const update = reply({ ...remotePerson, prenom: "Jean" });
    mock.from.mockReturnValueOnce(reply([remotePerson])).mockReturnValueOnce(update).mockReturnValueOnce(reply(null))
      .mockReturnValueOnce(reply([])).mockReturnValueOnce(reply([contractRow(created.id)]));
    await syncSupabaseOutbox();
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ prenom: "Jean" }));
    expect(getPendingOutbox()).toEqual([]);
    expect(await provider.contracts.getById(created.id)).toMatchObject({ firstName: "Jean" });
  });
});

it("places a corrected identity before the rejected update and its queued list", async () => {
  const user = { id: "me", workspaceId: input.workspaceId, role: "admin", taskSessionToken: "test" };
  localStorage.setItem("contribution_auth", JSON.stringify(user));
  const rejected = queueOutbox(input.workspaceId, "contract.update", { id: "contract", applicantId: applicant.nif, nif: applicant.nif, salaryNumber: 45000 });
  setOutboxError(rejected.id, "Salaire incorrect");
  const list = queueOutbox(input.workspaceId, "list.operation", { action: "add", contractIds: ["contract"], applicantIds: [applicant.nif] });
  await createSupabaseProvider().applicants.upsert(applicant);
  const pending = getPendingOutbox();
  expect(pending.map(item => item.type)).toEqual(["applicant.upsert", "contract.update", "list.operation"]);
  const restoredOrder = [...pending].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || (a.sequence ?? 0) - (b.sequence ?? 0));
  expect(restoredOrder.map(item => item.id)).toEqual(pending.map(item => item.id));
  expect(pending[2].id).toBe(list.id);
});

it("uses a new correction clock while retaining the identity's original queue position", async () => {
  upsertApplicantOffline(applicant);
  const original = getPendingOutbox()[0];
  await new LocalContractRepository().create(input);
  upsertApplicantOffline({ ...applicant, address: "Newest address" });
  const corrected = getPendingOutbox()[0];
  expect(corrected.createdAt).toBe(original.createdAt);
  expect(Date.parse(corrected.modifiedAt!)).toBeGreaterThan(Date.parse(original.modifiedAt!));
  expect(corrected.payload.address).toBe("Newest address");
});

it("resolves a NINU collision atomically on the server", async () => {
  upsertApplicantOffline({ ...applicant, ninu: "1234567890" });
  const pending = getPendingOutbox()[0];
  mock.from.mockReturnValue(reply([{ nif: "999-999-999-9", workspace_id: input.workspaceId, ninu: "1234567890", prenom: "Autre", nom: "Personne", modified_at: "2026-01-01" }]));
  mock.rpc.mockResolvedValue({ data: { nif: applicant.nif, workspace_id: input.workspaceId, ninu: "1234567890", prenom: "Jean", nom: "LOUIS", modified_at: pending.modifiedAt }, error: null });
  await syncSupabaseOutbox();
  expect(mock.rpc).toHaveBeenCalledWith("sync_identification_latest", expect.objectContaining({ p_modified_at: pending.modifiedAt }));
  expect(getPendingOutbox()).toEqual([]);
});

it("preserves a newer offline identity even if an older remote edit was uploaded afterwards", async () => {
  upsertApplicantOffline(applicant);
  const timestamp = getPendingOutbox()[0].modifiedAt!;
  const row = { nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Old", nom: "LOUIS", sexe: "Homme", adresse: "Delmas",
    modified_at: new Date(Date.parse(timestamp) - 1000).toISOString(), updated_at: new Date(Date.parse(timestamp) + 1000).toISOString() };
  const update = reply({ ...row, prenom: "Jean", modified_at: timestamp });
  mock.from.mockReturnValueOnce(reply([row])).mockReturnValueOnce(update);
  await syncSupabaseOutbox();
  expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ prenom: "Jean", modified_at: timestamp }));
  expect(getPendingOutbox()).toEqual([]);
});


it("restores the newer remote contract when an obsolete offline deletion is acknowledged", async () => {
  const provider = createSupabaseProvider();
  const row = contractRow("delete-race");
  mock.from.mockReturnValue(reply(row));
  await provider.contracts.getById("delete-race");
  await provider.contracts.softDelete("delete-race", input.workspaceId);
  const modifiedAt = new Date(Date.parse(getPendingOutbox()[0].modifiedAt!) + 1000).toISOString();
  const remote = reply({ ...row, titre: "Newer remote", modified_at: modifiedAt });
  mock.from.mockReset().mockReturnValue(remote);
  await syncSupabaseOutbox();
  expect(remote.update).not.toHaveBeenCalled();
  expect(getPendingOutbox()).toEqual([]);
  expect(await provider.contracts.getById("delete-race")).toMatchObject({ position: "Newer remote" });
});

it("restores a soft-deleted contract when the offline edit is newer than the deletion", async () => {
  const provider = createSupabaseProvider();
  const row = contractRow("restore-race");
  mock.from.mockReturnValue(reply(row));
  await provider.contracts.getById("restore-race");
  await provider.contracts.update({ id: "restore-race", position: "Newer local" });
  const modifiedAt = getPendingOutbox()[0].modifiedAt!;
  const deletedAt = new Date(Date.parse(modifiedAt) - 1000).toISOString();
  const update = reply({ ...row, titre: "Newer local", modified_at: modifiedAt, deleted_at: null });
  mock.from.mockReset().mockReturnValueOnce(reply({ ...row, deleted_at: deletedAt, modified_at: deletedAt })).mockReturnValueOnce(update);
  await syncSupabaseOutbox();
  expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ titre: "Newer local", deleted_at: null, modified_at: modifiedAt }));
  expect(getPendingOutbox()).toEqual([]);
});

it("preserves successive dossier edits made before their first upload", async () => {
  const provider = createSupabaseProvider();
  const dossier = await provider.dossiers.create({ workspaceId: input.workspaceId, name: "Original" });
  await provider.dossiers.update({ id: dossier.id, workspaceId: input.workspaceId, name: "Newest" });
  const [creation, edit] = getPendingOutbox();
  const row = { id: dossier.id, workspace_id: input.workspaceId, name: "Original", status: "active", priority: "normal", contract_target_count: 0,
    created_at: new Date().toISOString(), updated_at: new Date(Date.parse(edit.modifiedAt!) + 1000).toISOString(), modified_at: creation.modifiedAt };
  const insertion = reply(row);
  const update = reply({ ...row, name: "Newest", modified_at: edit.modifiedAt });
  mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(insertion).mockReturnValueOnce(reply(row)).mockReturnValueOnce(update);
  await syncSupabaseOutbox();
  expect(insertion.insert).toHaveBeenCalledWith(expect.objectContaining({ modified_at: creation.modifiedAt }));
  expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Newest", modified_at: edit.modifiedAt }));
  expect(getPendingOutbox()).toEqual([]);
  expect(await provider.dossiers.getById(dossier.id)).toMatchObject({ name: "Newest" });
});
