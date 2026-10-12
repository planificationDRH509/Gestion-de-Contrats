import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheMinisters } from "../settings/ministersCache";
import { LEGACY_MINISTER } from "../../lib/ministers";
import { LocalApplicantRepository } from "../../data/local/localApplicantRepository";
import { LocalContractRepository } from "../../data/local/localContractRepository";
import { LocalDossierRepository } from "../../data/local/localDossierRepository";
const createLocalProvider = () => ({ applicants: new LocalApplicantRepository(), contracts: new LocalContractRepository(), dossiers: new LocalDossierRepository() });
import { runContractImport, readImportRequest, type ImportRunInput } from "./contractImportRun";
import { loadDb } from "../../data/local/localDb";
import type { ContractImportDraft } from "./contractImport";

const row = (index: number): ContractImportDraft => ({
  contractId: `import-${index}`, sourceRowNumber: index + 2,
  nif: `123-456-789-${index}`, ninu: null, firstName: "Jean", lastName: `Louis${index}`,
  gender: "Homme", address: "Delmas", phone: null, position: "Agent", assignment: "MSPP",
  salaryNumber: 30000, salaryText: "", durationMonths: 12, commentaire: null
});
const input = (rows = [row(0)]): ImportRunInput => ({
  workspaceId: "w", responsibleUserId: "u", fiscalYear: "2026-2027", dossierId: null, rows
});
beforeEach(() => localStorage.clear());

describe("resumable import", () => {
  it("keeps the old data, moves the duplicate and refreshes its creation date", async () => {
    const provider = createLocalProvider();
    const [old] = (await runContractImport(provider, input())).contracts;
    await provider.contracts.update({ id: old.id, createdAt: "2026-10-01T00:00:00.000Z", status: "signe" });
    const applicant = vi.spyOn(provider.applicants, "upsert");
    const destination = await provider.dossiers.create({ workspaceId: "w", name: "Destination" });
    const result = await runContractImport(provider, { ...input([{
      ...row(0), contractId: "new-import", salaryNumber: 50000, firstName: "Autre",
      duplicateResolution: { contractId: old.id, action: "keep" }
    }]), dossierId: destination.id });
    expect(result.failures).toEqual([]);
    expect(result.contracts[0]).toMatchObject({ id: old.id, salaryNumber: 30000, firstName: "Jean", status: "signe", dossierId: destination.id });
    expect(result.contracts[0].createdAt).not.toBe("2026-10-01T00:00:00.000Z");
    expect(applicant).not.toHaveBeenCalled();
    expect(loadDb().contracts.filter(c => c.workspaceId === "w")).toHaveLength(1);
  });

  it("replaces the duplicate with new data and preserves the old contract in a note", async () => {
    const provider = createLocalProvider();
    const [old] = (await runContractImport(provider, input([{ ...row(0), commentaire: "Ancienne remarque" }]))).contracts;
    const result = await runContractImport(provider, input([{
      ...row(0), contractId: "replacement", salaryNumber: 50000, position: "Directeur", address: "Jacmel", commentaire: "Nouvelle remarque",
      duplicateResolution: { contractId: old.id, action: "replace" }
    }]));
    expect(result.failures).toEqual([]);
    expect(result.contracts[0]).toMatchObject({ id: old.id, salaryNumber: 50000, position: "Directeur", address: "Jacmel" });
    const note = result.contracts[0].commentaire;
    for (const text of ["Nouvelle remarque", "Ancienne remarque", "Salaire : 30000", "Poste : Agent", "Adresse : Delmas", old.createdAt]) expect(note).toContain(text);
    expect(loadDb().contracts.filter(c => c.workspaceId === "w")).toHaveLength(1);
  });

  it("does not confuse a rejected update with the existing contract and retries the original note", async () => {
    const provider = createLocalProvider();
    const [old] = (await runContractImport(provider, input())).contracts;
    const update = vi.spyOn(provider.contracts, "update").mockRejectedValueOnce(new Error("Refusé"));
    const attempt = input([{ ...row(0), address: "Jacmel", contractId: "replacement", duplicateResolution: { contractId: old.id, action: "replace" } }]);
    const first = await runContractImport(provider, attempt);
    expect(first.contracts).toHaveLength(0);
    expect(first.failures[0].error).toContain("Refusé");
    expect(readImportRequest("w", "replacement")?.duplicateUpdate?.commentaire).toContain("Adresse : Delmas");
    const retry = await runContractImport(provider, attempt);
    expect(retry.failures).toEqual([]);
    expect(retry.contracts[0].commentaire).toContain("Adresse : Delmas");
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("recovers a lost update response without replacing twice or duplicating the note", async () => {
    const provider = createLocalProvider();
    const [old] = (await runContractImport(provider, input())).contracts;
    const original = provider.contracts.update.bind(provider.contracts);
    const update = vi.spyOn(provider.contracts, "update").mockImplementation(async value => {
      await original(value);
      throw new Error("Connection lost");
    });
    const attempt = input([{ ...row(0), contractId: "replacement", duplicateResolution: { contractId: old.id, action: "replace" } }]);
    const result = await runContractImport(provider, attempt);
    expect(result.failures).toEqual([]);
    const retry = await runContractImport(provider, attempt);
    expect(retry.contracts[0].commentaire).toBe(result.contracts[0].commentaire);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("skips a new database conflict and imports the independent rows", async () => {
    const p = createLocalProvider();
    await runContractImport(p, input());
    const result = await runContractImport(p, input([{ ...row(0), contractId: "duplicate" }, row(1)]));
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0].nif).toBe(row(1).nif);
    expect(result.failures[0].contractId).toBe("duplicate");
  });

  it("keeps the same minister for the whole import when the selection changes midway", async () => {
    const successor = { ...LEGACY_MINISTER, id: "new-minister", fullName: "Marie TEST", gender: "Femme" as const };
    cacheMinisters({ ministers: [LEGACY_MINISTER, successor], currentMinisterId: successor.id });
    const provider = createLocalProvider();
    const create = provider.contracts.create.bind(provider.contracts);
    vi.spyOn(provider.contracts, "create").mockImplementation(async value => {
      cacheMinisters({ ministers: [LEGACY_MINISTER, successor], currentMinisterId: LEGACY_MINISTER.id });
      return create(value);
    });
    const result = await runContractImport(provider, input([row(0), row(1)]));
    expect(result.failures).toEqual([]);
    expect(result.contracts.map(c => c.ministerId)).toEqual([successor.id, successor.id]);
    expect(readImportRequest("w", "import-0")?.ministerId).toBe(successor.id);
  });
  it("continues after a rejected line, reports exact receipts, and retries only missing contracts", async () => {
    const provider = createLocalProvider();
    const create = provider.contracts.create.bind(provider.contracts);
    let rejectSecond = true;
    const spy = vi.spyOn(provider.contracts, "create").mockImplementation(async value => {
      if (value.id === "import-1" && rejectSecond) throw new Error("Salaire refusé");
      return create(value);
    });
    const progress = vi.fn();
    const first = await runContractImport(provider, { ...input([row(0), row(1), row(2)]), onRowResult: progress });
    expect(first.contracts).toHaveLength(2);
    expect(first.failures).toEqual([{ contractId: "import-1", error: "Ligne 3 — Salaire refusé" }]);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(loadDb().contracts.filter(contract => contract.workspaceId === "w")).toHaveLength(2);
    rejectSecond = false;
    spy.mockClear();
    const result = await runContractImport(provider, { ...input([row(0), row(1), row(2)]), dossierId: first.contracts[0].dossierId! });
    expect(result.contracts).toHaveLength(3);
    expect(result.failures).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].id).toBe("import-1");
    expect(loadDb().contracts.filter(contract => contract.workspaceId === "w")).toHaveLength(3);
  });

  it("reconciles a lost response without creating the contract twice", async () => {
    const provider = createLocalProvider();
    const create = provider.contracts.create.bind(provider.contracts);
    const spy = vi.spyOn(provider.contracts, "create").mockImplementation(async value => {
      await create(value);
      throw new Error("Connection lost");
    });
    const result = await runContractImport(provider, input());
    expect(result.contracts).toHaveLength(1);
    expect(result.failures).toEqual([]);
    await runContractImport(provider, input());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("preserves the saved request and dossier while confirmation is unavailable", async () => {
    const provider = createLocalProvider();
    const create = provider.contracts.create.bind(provider.contracts);
    const createSpy = vi.spyOn(provider.contracts, "create").mockImplementation(async value => {
      await create(value);
      throw new Error("Connection lost");
    });
    const get = vi.spyOn(provider.contracts, "getById").mockRejectedValue(new Error("offline"));
    const remove = vi.spyOn(provider.dossiers, "delete");
    const result = await runContractImport(provider, input());
    expect(result.failures).toHaveLength(1);
    expect(readImportRequest("w", "import-0")?.id).toBe("import-0");
    expect(remove).not.toHaveBeenCalled();
    get.mockRestore();
    const resumed = await runContractImport(provider, input());
    expect(resumed.contracts).toHaveLength(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks selected duplicates and same-year contracts before any new write", async () => {
    const provider = createLocalProvider();
    const dossier = vi.spyOn(provider.dossiers, "create");
    const applicant = vi.spyOn(provider.applicants, "upsert");
    expect((await runContractImport(provider, input([row(0), { ...row(0), contractId: "other" }]))).failures[0].error).toContain("répété");
    expect(dossier).not.toHaveBeenCalled();
    expect(applicant).not.toHaveBeenCalled();
    await runContractImport(provider, input());
    dossier.mockClear(); applicant.mockClear();
    expect((await runContractImport(provider, input([{ ...row(0), contractId: "another-import" }]))).failures[0].error).toContain("2026-2027");
    expect(dossier).not.toHaveBeenCalled();
    expect(applicant).not.toHaveBeenCalled();
  });

  it("removes only its own verified empty dossier when every contract fails", async () => {
    const provider = createLocalProvider();
    vi.spyOn(provider.contracts, "create").mockRejectedValue(new Error("Enregistrement refusé"));
    const folderChanged = vi.fn();
    await runContractImport(provider, { ...input(), onDossierCreated: folderChanged });
    expect(folderChanged).toHaveBeenLastCalledWith("");
    expect(await provider.dossiers.list("w")).toHaveLength(0);
    const existing = await provider.dossiers.create({ workspaceId: "w", name: "Dossier personnel" });
    await runContractImport(provider, { ...input(), dossierId: existing.id });
    expect(await provider.dossiers.getById(existing.id)).not.toBeNull();
  });

  it("keeps a same-name existing dossier and chooses a distinct name", async () => {
    const provider = createLocalProvider();
    const existing = await provider.dossiers.create({ workspaceId: "w", name: "Louis0 Jean" });
    const result = await runContractImport(provider, input());
    expect(result.contracts[0].dossierId).not.toBe(existing.id);
    expect((await provider.dossiers.list("w")).map(folder => folder.name)).toContain("Louis0 Jean (2)");
  });

  it("does not send a contract if its durable request cannot be saved", async () => {
    const provider = createLocalProvider();
    const set = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key.startsWith("contract_import_request:")) throw new Error("Quota exceeded");
      return set.call(this, key, value);
    });
    const create = vi.spyOn(provider.contracts, "create");
    try {
      const result = await runContractImport(provider, input());
      expect(result.failures[0].error).toContain("sauvegarder la reprise");
      expect(create).not.toHaveBeenCalled();
    } finally { storage.mockRestore(); }
  });
});
