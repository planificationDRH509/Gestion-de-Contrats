import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateContractInput, UpsertApplicantInput } from "../types";
import { createSupabaseProvider, syncSupabaseOutbox, getSupabaseSyncState } from "./supabaseProvider";
import { cacheApplicant, cacheContracts, getPendingOutbox, isOfflineFailure, replaceWorkspaceCache, upsertApplicantOffline } from "../local/offlineStore";
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
  for (const method of ["select", "eq", "is", "in", "order", "limit", "insert", "update"]) {
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
  mock.from.mockReset();
  mock.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  online(true);
});

describe("offline contract creation and replay", () => {
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
    const failed = reply(null, { message: "TypeError: Failed to fetch" });
    mock.from.mockReturnValue(failed);
    const provider = createSupabaseProvider();
    const created = await provider.contracts.create(input);
    expect(failed.insert.mock.calls[0][0][0].id_contrat).toBe(created.id);
    const remote = reply(contractRow(created.id));
    mock.from.mockReturnValue(remote);
    await syncSupabaseOutbox();
    expect(remote.insert).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toHaveLength(0);
  });

  it("retains a conflicting UUID locally and never overwrites the server", async () => {
    const created = await new LocalContractRepository().create(input);
    const remote = reply({ ...contractRow(created.id), titre: "Directeur" });
    mock.from.mockReturnValue(remote);
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toHaveLength(1);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toContain("Conflit sur le contrat");
    expect(remote.insert).not.toHaveBeenCalled();
    expect(remote.update).not.toHaveBeenCalled();
    expect(await createSupabaseProvider().contracts.getById(created.id)).toMatchObject({ position: "Analyste" });
  });

  it("blocks dependent contracts when the remote identity differs, preserving the error and local data", async () => {
    upsertApplicantOffline(applicant);
    const created = await new LocalContractRepository().create(input);
    const remote = reply([{ nif: applicant.nif, workspace_id: input.workspaceId, prenom: "Autre", nom: "LOUIS", sexe: "Homme", adresse: "Delmas" }]);
    mock.from.mockReturnValue(remote);
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toHaveLength(2);
    expect(mock.from.mock.calls.every(([table]) => table === "identification")).toBe(true);
    expect(remote.update).not.toHaveBeenCalled();
    expect(getSupabaseSyncState(input.workspaceId).lastError).toContain("Conflit d'identification");
    replaceWorkspaceCache(input.workspaceId, { applicants: [], contracts: [], dossiers: [], tags: [] });
    expect(await new LocalContractRepository().getById(created.id)).not.toBeNull();
  });

  it("does not replace a pending local version during a cache refresh", async () => {
    const repo = new LocalContractRepository();
    const created = await repo.create(input);
    cacheContracts([{ ...created, position: "Remote" }]);
    expect(await repo.getById(created.id)).toMatchObject({ position: input.position });
  });

  it("rejects a cached NINU attached to another NIF", () => {
    upsertApplicantOffline({ ...applicant, ninu: "12345678901234" });
    expect(() => upsertApplicantOffline({ ...applicant, nif: "999-999-999-9", ninu: "12345678901234" })).toThrow("NIF différent");
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

  it("retains conflicting salary edits for explicit resolution", async () => {
    const provider = createSupabaseProvider();
    const row = contractRow("editable");
    mock.from.mockReturnValue(reply(row));
    await provider.contracts.getById("editable");
    online(false);
    await provider.contracts.update({ id: "editable", salaryNumber: 35000 });
    online(true);
    const read = reply({ ...row, salaire_en_chiffre: 45000 });
    mock.from.mockReset().mockReturnValue(read);
    await syncSupabaseOutbox();
    expect(read.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()[0].conflict).toMatchObject({ fields: ["salaryNumber"], remote: { salaryNumber: 45000 } });
  });
  function seed(id = "existing") {
    cacheContracts([{ ...input, id, createdAt: "2026-09-16T10:00:00Z", updatedAt: "2026-09-16T10:00:00Z" }]);
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

  it("keeps a conflicting local state without overwriting the remote state", async () => {
    const id = seed();
    await new LocalContractRepository().updateStatus(input.workspaceId, [id], "imprime");
    const remote = reply({ ...contractRow(id), status: "signe" });
    mock.from.mockReturnValue(remote);
    await syncSupabaseOutbox();
    expect(remote.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toHaveLength(1);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toContain("Conflit d’état");
    expect(await createSupabaseProvider().contracts.getById(id)).toMatchObject({ status: "imprime" });
  });

  it("retains the operation if another writer wins between reading and updating", async () => {
    const id = seed();
    await new LocalContractRepository().updateStatus(input.workspaceId, [id], "imprime");
    mock.from.mockReturnValueOnce(reply(contractRow(id))).mockReturnValueOnce(reply(null));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toHaveLength(1);
    expect(getSupabaseSyncState(input.workspaceId).lastError).toContain("pendant la synchronisation");
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
  it("continues unrelated contracts after an identity conflict and keeps the error visible", async () => {
    upsertApplicantOffline(applicant);
    const blocked = await new LocalContractRepository().create(input);
    const independent = await new LocalContractRepository().create({ ...input, nif: "999-999-999-9", applicantId: "999-999-999-9" });
    const conflict = reply([{ nif: applicant.nif, prenom: "Autre", nom: "LOUIS", sexe: "Homme", adresse: "Delmas" }]);
    const otherRow = { ...contractRow(independent.id), nif: independent.nif };
    mock.from.mockReturnValueOnce(conflict).mockReturnValueOnce(reply(null))
      .mockReturnValueOnce(reply([])).mockReturnValueOnce(reply([otherRow]));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toHaveLength(2);
    expect(getPendingOutbox().some((item) => item.payload.id === independent.id)).toBe(false);
    expect(getPendingOutbox().find((item) => item.payload.id === blocked.id)?.lastError).toContain("attente");
    expect(getSupabaseSyncState(input.workspaceId).lastError).toContain("Conflit");
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

  it("retains a creation when the same NIF/year was created on the cloud while offline", async () => {
    const contract = await new LocalContractRepository().create(input);
    const duplicates = reply([contractRow("another-device")]);
    mock.from.mockReturnValueOnce(reply(null)).mockReturnValueOnce(duplicates);
    await syncSupabaseOutbox();
    expect(duplicates.insert).not.toHaveBeenCalled();
    expect(getPendingOutbox().find((item) => item.payload.id === contract.id)?.lastError).toContain("existe déjà");
  });
});
