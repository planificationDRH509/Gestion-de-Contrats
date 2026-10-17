import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Applicant, Contract } from "../types";
import { loadDb } from "../local/localDb";
import { queueOutbox } from "../local/localOutbox";
import { cacheApplicant, cacheContract, getPendingOutbox, upsertApplicantOffline } from "../local/offlineStore";
import { createSupabaseProvider, syncSupabaseOutbox } from "./supabaseProvider";
import { LEGACY_MINISTER } from "../../lib/ministers";

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mock.from, rpc: mock.rpc }) }));
const workspaceId = "workspace_default";
const oldNif = "123-456-789-0";
const newNif = "123-456-789-1";
const initialTime = "2026-01-01T10:00:00.000Z";
const person: Applicant = { id: oldNif, nif: oldNif, workspaceId, firstName: "Jean", lastName: "LOUIS",
  gender: "Homme", ninu: "1234567890", address: "Delmas", phone: "+509 37123456", createdAt: initialTime,
  modifiedAt: initialTime, updatedAt: initialTime, remoteUpdatedAt: initialTime, createdBy: null };
const personRow = { nif: oldNif, workspace_id: workspaceId, prenom: person.firstName, nom: person.lastName,
  sexe: person.gender, ninu: person.ninu, telephone: person.phone, adresse: person.address,
  created_at: initialTime, modified_at: initialTime, updated_at: initialTime, created_by: null };
const contract: Contract = { ...person, id: "identity-edit-contract", applicantId: oldNif, ministerId: LEGACY_MINISTER.id,
  status: "saisie", position: "Analyste", assignment: "Planification", salaryNumber: 30000, salaryText: "trente mille",
  durationMonths: 12, annee_fiscale: "2025-2026", dossierId: null };
function contractRow(overrides: Record<string, unknown> = {}) {
  return { id_contrat: contract.id, workspace_id: workspaceId, nif: oldNif, ministre_id: LEGACY_MINISTER.id,
    status: contract.status, titre: contract.position, lieu_affectation: contract.assignment,
    salaire_en_chiffre: contract.salaryNumber, duree_contrat: contract.durationMonths,
    annee_fiscale: contract.annee_fiscale, created_at: initialTime, modified_at: initialTime, updated_at: initialTime,
    identification: personRow, ...overrides };
}
function reply(data: unknown, error: unknown = null) {
  const chain: any = {};
  for (const method of ["select", "eq", "is", "in", "order", "limit", "insert", "upsert", "update", "range"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  chain.single = vi.fn(async () => ({ data, error }));
  chain.then = (resolve: any) => Promise.resolve({ data, error, count: Array.isArray(data) ? data.length : null }).then(resolve);
  return chain;
}
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mock.from.mockReset(); mock.rpc.mockReset();
  cacheApplicant(person); cacheContract(contract);
});

describe("identity edits during synchronization", () => {
  it("renames the existing NIF with a version guard and preserves an omitted NINU", async () => {
    const { ninu: _ninu, ...withoutNinu } = person;
    queueOutbox(workspaceId, "applicant.upsert", { ...withoutNinu, id: oldNif, nif: newNif, baseApplicant: person });
    const pending = getPendingOutbox()[0];
    const update = reply({ ...personRow, nif: newNif, modified_at: pending.modifiedAt });
    const selection = reply([personRow]);
    mock.from.mockReturnValueOnce(selection).mockReturnValueOnce(update);

    await syncSupabaseOutbox();

    expect(selection.in).toHaveBeenCalledWith("nif", [oldNif, newNif]);
    expect(update.update).toHaveBeenCalledWith({ nif: newNif, modified_at: pending.modifiedAt });
    expect(update.eq).toHaveBeenCalledWith("nif", oldNif);
    expect(update.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(update.eq).toHaveBeenCalledWith("updated_at", initialTime);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(update.insert).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().applicants.find(row => row.id === newNif)?.ninu).toBe(person.ninu);
    expect(loadDb().contracts.find(row => row.id === contract.id)).toMatchObject({ nif: newNif, ninu: person.ninu });
  });

  it("updates a NINU on the same identity without replacing the person or its contract", async () => {
    upsertApplicantOffline({ ...person, ninu: "9876543210" });
    const pending = getPendingOutbox()[0];
    const update = reply({ ...personRow, ninu: "9876543210", modified_at: pending.modifiedAt });
    mock.from.mockReturnValueOnce(reply([personRow])).mockReturnValueOnce(reply([])).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(update.update).toHaveBeenCalledWith({ ninu: "9876543210", modified_at: pending.modifiedAt });
    expect(loadDb().contracts.find(row => row.id === contract.id)).toMatchObject({ id: contract.id, nif: oldNif, ninu: "9876543210" });
    expect(getPendingOutbox()).toEqual([]);
  });

  it("keeps an actual NINU collision pending without stealing or clearing the other person's NINU", async () => {
    upsertApplicantOffline({ ...person, ninu: "9876543210" });
    const other = { ...personRow, nif: "999-999-999-9", ninu: "9876543210", prenom: "Autre" };
    const query = reply([personRow, other]);
    mock.from.mockReturnValue(query);
    await syncSupabaseOutbox();
    expect(query.update).not.toHaveBeenCalled();
    expect(query.insert).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ lastError: expect.stringContaining("NINU 9876543210 appartient déjà") })]);
    expect(loadDb().contracts.find(row => row.id === contract.id)?.ninu).toBe("9876543210");
  });

  it("does not merge another identity when the requested new NIF already exists", async () => {
    upsertApplicantOffline({ ...person, nif: newNif });
    const query = reply([personRow, { ...personRow, nif: newNif, ninu: null, prenom: "Autre" }]);
    mock.from.mockReturnValue(query);
    await syncSupabaseOutbox();
    expect(query.update).not.toHaveBeenCalled();
    expect(query.insert).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(getPendingOutbox()[0].lastError).toContain(`NIF ${newNif} appartient déjà`);
  });

  it("acknowledges an already committed rename after a lost response without inserting again", async () => {
    upsertApplicantOffline({ ...person, nif: newNif });
    const pending = getPendingOutbox()[0];
    const query = reply([{ ...personRow, nif: newNif, modified_at: pending.modifiedAt!.replace("Z", "+00:00") }]);
    mock.from.mockReturnValue(query);
    await syncSupabaseOutbox();
    expect(query.insert).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().applicants.filter(row => row.id === oldNif)).toEqual([]);
  });

  it("does not assume an unrelated target is a replay just because creation metadata coincides", async () => {
    upsertApplicantOffline({ ...person, nif: newNif });
    const query = reply([{ ...personRow, nif: newNif }]);
    mock.from.mockReturnValue(query);
    await syncSupabaseOutbox();
    expect(query.insert).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()[0].lastError).toContain(`NIF ${newNif} appartient déjà`);
  });

  it("rebases an edit made during a rename request without restoring the obsolete local NIF", async () => {
    upsertApplicantOffline({ ...person, nif: newNif });
    const first = getPendingOutbox()[0];
    let acknowledge!: (value: { data: unknown; error: null }) => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    const update = reply(null);
    update.maybeSingle.mockImplementation(() => {
      started();
      return new Promise(resolve => { acknowledge = resolve; });
    });
    mock.from.mockReturnValueOnce(reply([personRow])).mockReturnValueOnce(reply([personRow])).mockReturnValueOnce(update);
    const synchronization = syncSupabaseOutbox();
    await waiting;
    const newestNif = "123-456-789-2";
    upsertApplicantOffline({ ...person, id: newNif, nif: newestNif });
    acknowledge({ data: { ...personRow, nif: newNif, modified_at: first.modifiedAt }, error: null });
    await synchronization;
    expect(getPendingOutbox()).toEqual([expect.objectContaining({ payload: expect.objectContaining({ id: newNif, nif: newestNif }) })]);
    expect(loadDb().applicants.find(row => row.id === newestNif)?.ninu).toBe(person.ninu);
    expect(loadDb().applicants.some(row => row.id === newNif)).toBe(false);
    expect(loadDb().contracts.find(row => row.id === contract.id)?.nif).toBe(newestNif);
    const pending = getPendingOutbox()[0];
    const nextUpdate = reply({ ...personRow, nif: newestNif, modified_at: pending.modifiedAt });
    mock.from.mockReturnValueOnce(reply([{ ...personRow, nif: newNif, modified_at: first.modifiedAt }]))
      .mockReturnValueOnce(reply([{ ...personRow, nif: newNif, modified_at: first.modifiedAt }])).mockReturnValueOnce(nextUpdate);
    await syncSupabaseOutbox();
    expect(nextUpdate.eq).toHaveBeenCalledWith("nif", newNif);
    expect(nextUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ nif: newestNif }));
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().contracts.find(row => row.id === contract.id)?.ninu).toBe(person.ninu);
  });

  it("saves contractual edits together with a cascaded NIF despite the newer server cascade clock", async () => {
    queueOutbox(workspaceId, "contract.update", { id: contract.id, nif: newNif, applicantId: newNif,
      salaryNumber: 45000, baseContract: contract });
    const pending = getPendingOutbox()[0];
    const cascadeClock = new Date(Date.parse(pending.modifiedAt!) + 1000).toISOString();
    const remote = contractRow({ nif: newNif, modified_at: cascadeClock, updated_at: cascadeClock });
    const update = reply({ ...remote, salaire_en_chiffre: 45000 });
    mock.from.mockReturnValueOnce(reply(remote)).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ salaire_en_chiffre: 45000 }));
    expect(Date.parse(update.update.mock.calls[0][0].modified_at)).toBeGreaterThan(Date.parse(cascadeClock));
    expect(update.eq).toHaveBeenCalledWith("updated_at", cascadeClock);
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().contracts.find(row => row.id === contract.id)?.salaryNumber).toBe(45000);
  });

  it("preserves a later queued edit when its base matches our preceding replay", async () => {
    const base = { ...contract, applicantId: newNif, nif: newNif, salaryNumber: 45000 };
    queueOutbox(workspaceId, "contract.update", { id: contract.id, salaryNumber: 50000, baseContract: base });
    const pending = getPendingOutbox()[0];
    const replayClock = new Date(Date.parse(pending.modifiedAt!) + 1000).toISOString();
    const remote = contractRow({ nif: newNif, salaire_en_chiffre: 45000, modified_at: replayClock, updated_at: replayClock });
    const update = reply({ ...remote, salaire_en_chiffre: 50000 });
    mock.from.mockReturnValueOnce(reply(remote)).mockReturnValueOnce(update);
    await syncSupabaseOutbox();
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ salaire_en_chiffre: 50000 }));
    expect(getPendingOutbox()).toEqual([]);
  });

  it("still keeps a newer genuinely different server edit when a NIF cascade also occurred", async () => {
    queueOutbox(workspaceId, "contract.update", { id: contract.id, nif: newNif, applicantId: newNif,
      salaryNumber: 45000, baseContract: contract });
    const pending = getPendingOutbox()[0];
    const query = reply(contractRow({ nif: newNif, salaire_en_chiffre: 70000,
      modified_at: new Date(Date.parse(pending.modifiedAt!) + 1000).toISOString() }));
    mock.from.mockReturnValue(query);
    await syncSupabaseOutbox();
    expect(query.update).not.toHaveBeenCalled();
    expect(getPendingOutbox()).toEqual([]);
    expect(loadDb().contracts.find(row => row.id === contract.id)?.salaryNumber).toBe(70000);
  });

  it("searches the pending identity when only its NIF has been edited", async () => {
    upsertApplicantOffline({ ...person, nif: newNif });
    mock.from.mockReturnValue(reply([contractRow()]));
    const result = await createSupabaseProvider().contracts.list({ workspaceId, query: newNif, all: true });
    expect(result.items).toEqual([expect.objectContaining({ id: contract.id, nif: newNif, ninu: person.ninu })]);
    expect(result.total).toBe(1);
  });

  it("returns the acknowledged NINU when an older selected-contract response arrives last", async () => {
    let finish!: (value: { data: unknown; error: null }) => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    const delayed = reply(null);
    delayed.then = (resolve: (value: unknown) => void) => {
      started();
      return new Promise<{ data: unknown; error: null }>(accept => { finish = accept; }).then(resolve);
    };
    mock.from.mockReturnValueOnce(delayed);
    const response = createSupabaseProvider().contracts.getByIds([contract.id, "uncached-contract"], workspaceId);
    await waiting;
    upsertApplicantOffline({ ...person, ninu: "9876543210" });
    const pending = getPendingOutbox()[0];
    mock.from.mockReturnValueOnce(reply([personRow])).mockReturnValueOnce(reply([]))
      .mockReturnValueOnce(reply({ ...personRow, ninu: "9876543210", modified_at: pending.modifiedAt }));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
    finish({ data: [contractRow()], error: null });
    const result = await response;
    expect(result).toEqual([expect.objectContaining({ id: contract.id, ninu: "9876543210" })]);
    expect(loadDb().contracts.find(row => row.id === contract.id)?.ninu).toBe("9876543210");
  });

  it("keeps the acknowledged NIF when an identity lookup started during its upload returns the old row", async () => {
    upsertApplicantOffline({ ...person, nif: newNif });
    const pending = getPendingOutbox()[0];
    let finish!: (value: { data: unknown; error: null }) => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    const delayed = reply(null);
    delayed.then = (resolve: (value: unknown) => void) => {
      started();
      return new Promise<{ data: unknown; error: null }>(accept => { finish = accept; }).then(resolve);
    };
    mock.from.mockReturnValueOnce(delayed);
    const response = createSupabaseProvider().applicants.findManyByNifOrNinu(workspaceId, [oldNif, newNif], []);
    await waiting;
    mock.from.mockReturnValueOnce(reply([personRow])).mockReturnValueOnce(reply([personRow]))
      .mockReturnValueOnce(reply({ ...personRow, nif: newNif, modified_at: pending.modifiedAt }));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toEqual([]);
    finish({ data: [personRow], error: null });
    const result = await response;
    expect(result).toEqual([expect.objectContaining({ id: newNif, nif: newNif, ninu: person.ninu })]);
    expect(loadDb().applicants.some(row => row.id === oldNif)).toBe(false);
  });

});
