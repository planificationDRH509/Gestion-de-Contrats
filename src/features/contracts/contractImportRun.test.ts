import { beforeEach, describe, expect, it, vi } from "vitest";
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
    await expect(runContractImport(provider, input([row(0), { ...row(0), contractId: "other" }]))).rejects.toThrow("répété");
    expect(dossier).not.toHaveBeenCalled();
    expect(applicant).not.toHaveBeenCalled();
    await runContractImport(provider, input());
    dossier.mockClear(); applicant.mockClear();
    await expect(runContractImport(provider, input([{ ...row(0), contractId: "another-import" }]))).rejects.toThrow("2026-2027");
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
