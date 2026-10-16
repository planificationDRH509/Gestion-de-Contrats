import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalApplicantRepository } from "../../data/local/localApplicantRepository";
import { LocalContractRepository } from "../../data/local/localContractRepository";
import { LocalDossierRepository } from "../../data/local/localDossierRepository";
import { runContractImport, type ImportRunInput } from "./contractImportRun";
import { getPendingOutbox } from "../../data/local/offlineStore";
import { skipDuplicateContract } from "../../data/local/skipDuplicateContract";
import { loadImportBatch, undoContractImport } from "./contractImportBatch";
import type { ContractImportDraft } from "./contractImport";
const provider = () => ({ applicants: new LocalApplicantRepository(), contracts: new LocalContractRepository(), dossiers: new LocalDossierRepository() });
const row = (i: number): ContractImportDraft => ({ contractId: `row-${i}`, nif: `123-456-789-${i}`, ninu: null, firstName: "Jean", lastName: "Louis", gender: "Homme", address: "Delmas", phone: null, position: "Agent", assignment: "MSPP", salaryNumber: 30000, salaryText: "", durationMonths: 12, commentaire: "Avant" });
const input = (rows: ContractImportDraft[]): ImportRunInput => ({ workspaceId: "w", userId: "u", batchId: "batch", dossierId: null, fiscalYear: "2026-2027", responsibleUserId: "u", rows });
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("import batch undo", () => {
  it("does not undo the existing server contract or its identity when an imported duplicate was skipped", async () => {
    const p = provider();
    const imported = await runContractImport(p, input([row(0)]));
    const local = imported.contracts[0];
    skipDuplicateContract(getPendingOutbox().find(item => item.type === "contract.create" && item.payload.id === local.id)!, { ...local, id: "existing-server" });
    const remove = vi.spyOn(p.contracts, "softDelete");
    const update = vi.spyOn(p.contracts, "update");
    const upsert = vi.spyOn(p.applicants, "upsert");
    const result = await undoContractImport(p, "w", "u", "batch");
    expect(result.errors).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect((await runContractImport(p, input([row(0)]))).skipped).toEqual([{ contractId: row(0).contractId, skipped: true }]);
  });
  it("removes new contracts and restores moved/replaced contracts and their previous identification", async () => {
    const p = provider();
    const initial = await runContractImport(p, { ...input([row(0), row(1)]), batchId: undefined });
    const [kept, replaced] = initial.contracts;
    const folder = await p.dossiers.create({ workspaceId: "w", name: "Nouveau" });
    const rows: ContractImportDraft[] = [
      { ...row(0), contractId: "keep", duplicateResolution: { contractId: kept.id, action: "keep" } },
      { ...row(1), contractId: "replace", firstName: "Marie", address: "Jacmel", salaryNumber: 50000, duplicateResolution: { contractId: replaced.id, action: "replace" } }, row(2)
    ];
    const imported = await runContractImport(p, { ...input(rows), dossierId: folder.id });
    expect(imported.failures).toEqual([]);
    expect(loadImportBatch("w", "u", "batch")?.entries).toHaveLength(3);
    const result = await undoContractImport(p, "w", "u", "batch");
    expect(result.errors).toEqual([]);
    expect(result.undoneRowIds).toHaveLength(3);
    expect(await p.contracts.getById(kept.id)).toMatchObject({ dossierId: kept.dossierId, createdAt: kept.createdAt });
    expect(await p.contracts.getById(replaced.id)).toMatchObject({ salaryNumber: 30000, firstName: "Jean", address: "Delmas", commentaire: "Avant", dossierId: replaced.dossierId });
    expect(await p.applicants.getById(replaced.nif!)).toMatchObject({ firstName: "Jean", address: "Delmas" });
    expect(await p.contracts.getById("row-2")).toBeNull();
    expect((await undoContractImport(p, "w", "u", "batch")).undoneRowIds).toEqual([]);
  });

  it("leaves later edits untouched while cancelling the other rows", async () => {
    const p = provider();
    await runContractImport(p, input([row(0), row(1)]));
    await p.contracts.update({ id: "row-0", salaryNumber: 90000 });
    const result = await undoContractImport(p, "w", "u", "batch");
    expect(result.undoneRowIds).toEqual(["row-1"]);
    expect(result.errors[0]).toContain("modifié après l’import");
    expect((await p.contracts.getById("row-0"))?.salaryNumber).toBe(90000);
  });

  it("protects a creation date edited after importing a new contract", async () => {
    const p = provider();
    await runContractImport(p, input([row(0)]));
    await p.contracts.update({ id: "row-0", createdAt: "2026-10-02T00:00:00.000Z" });
    const result = await undoContractImport(p, "w", "u", "batch");
    expect(result.undoneRowIds).toEqual([]);
    expect(result.errors[0]).toContain("modifié après l’import");
  });

  it("resumes restoration after its response is lost", async () => {
    const p = provider();
    const old = (await runContractImport(p, { ...input([row(0)]), batchId: undefined })).contracts[0];
    await runContractImport(p, input([{ ...row(0), contractId: "replace", salaryNumber: 50000, duplicateResolution: { contractId: old.id, action: "replace" } }]));
    const update = p.contracts.update.bind(p.contracts);
    const spy = vi.spyOn(p.contracts, "update").mockImplementation(async (...args) => { await update(...args); throw new Error("offline"); });
    expect((await undoContractImport(p, "w", "u", "batch")).errors).toHaveLength(1);
    expect((await undoContractImport(p, "w", "u", "batch")).undoneRowIds).toEqual(["replace"]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not restore an identity changed after replacement", async () => {
    const p = provider();
    const old = (await runContractImport(p, { ...input([row(0)]), batchId: undefined })).contracts[0];
    await runContractImport(p, input([{ ...row(0), contractId: "replace", address: "Jacmel", duplicateResolution: { contractId: old.id, action: "replace" } }]));
    const person = (await p.applicants.getById(old.nif!))!;
    await p.applicants.upsert({ ...person, phone: "37123456" });
    const result = await undoContractImport(p, "w", "u", "batch");
    expect(result.undoneRowIds).toEqual([]);
    expect(result.errors[0]).toContain("identification");
    expect((await p.contracts.getById(old.id))?.address).toBe("Jacmel");
  });

  it("resumes an undo after the deletion response is lost", async () => {
    const p = provider();
    await runContractImport(p, input([row(0)]));
    const remove = p.contracts.softDelete.bind(p.contracts);
    const spy = vi.spyOn(p.contracts, "softDelete").mockImplementation(async (...args) => { await remove(...args); throw new Error("offline"); });
    expect((await undoContractImport(p, "w", "u", "batch")).errors).toHaveLength(1);
    expect((await undoContractImport(p, "w", "u", "batch")).undoneRowIds).toEqual(["row-0"]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("preserves the original snapshot after a failed create and a retry", async () => {
    const p = provider();
    await p.applicants.upsert({ ...row(0), workspaceId: "w", id: row(0).nif });
    const create = vi.spyOn(p.contracts, "create").mockRejectedValueOnce(new Error("refusé"));
    const attempt = input([{ ...row(0), address: "Jacmel" }]);
    await runContractImport(p, attempt);
    await runContractImport(p, attempt);
    expect(create).toHaveBeenCalledTimes(2);
    expect(loadImportBatch("w", "u", "batch")?.entries[0].beforeApplicant?.address).toBe("Delmas");
    expect((await undoContractImport(p, "w", "u", "batch")).errors).toEqual([]);
    expect((await p.applicants.getById(row(0).nif))?.address).toBe("Delmas");
  });

  it("blocks writes if the undo snapshot cannot be saved", async () => {
    const p = provider();
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key.startsWith("contract_import_batch:")) throw new Error("quota");
      set.call(this, key, value);
    });
    const create = vi.spyOn(p.contracts, "create");
    const applicant = vi.spyOn(p.applicants, "upsert");
    const result = await runContractImport(p, input([row(0)]));
    expect(result.failures[0].error).toContain("historique");
    expect(create).not.toHaveBeenCalled(); expect(applicant).not.toHaveBeenCalled();
  });
});
