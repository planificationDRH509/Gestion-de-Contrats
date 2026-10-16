import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheMinisters } from "../settings/ministersCache";
import { LEGACY_MINISTER } from "../../lib/ministers";
import { LocalApplicantRepository } from "../../data/local/localApplicantRepository";
import { LocalContractRepository } from "../../data/local/localContractRepository";
import { LocalDossierRepository } from "../../data/local/localDossierRepository";
const createLocalProvider = () => ({ applicants: new LocalApplicantRepository(), contracts: new LocalContractRepository(), dossiers: new LocalDossierRepository() });
import { runContractImport, readImportRequest, type ImportRunInput } from "./contractImportRun";
import { loadDb } from "../../data/local/localDb";
import { getPendingOutbox, replaceLocalDossierId } from "../../data/local/offlineStore";
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
  it("keeps importing into the canonical folder when its ID changes after the first row", async () => {
    const provider = createLocalProvider();
    let originalId = "";
    const result = await runContractImport(provider, { ...input(Array.from({ length: 12 }, (_, index) => ({ ...row(index), nif: `123-456-${String(index).padStart(3, "0")}-0` }))),
      onDossierCreated: id => { originalId = id; },
      onRowResult: result => {
        if (result.contract?.id !== "import-0") return;
        const dossier = loadDb().dossiers.find(d => d.id === originalId)!;
        replaceLocalDossierId("w", originalId, { ...dossier, id: "server-dossier" });
      }
    });
    expect(result.failures).toEqual([]);
    expect(result.contracts).toHaveLength(12);
    expect(loadDb().contracts.filter(c => c.workspaceId === "w").map(c => c.dossierId)).toEqual(Array(12).fill("server-dossier"));
    expect(getPendingOutbox().filter(item => item.type === "contract.create").map(item => item.payload.dossierId)).toEqual(Array(12).fill("server-dossier"));
    expect(await provider.dossiers.getById(originalId)).toMatchObject({ id: "server-dossier" });
    expect((await provider.contracts.list({ workspaceId: "w", dossierId: originalId, all: true })).total).toBe(12);
  });

  it("resumes a saved row request using the folder reconciled during the previous attempt", async () => {
    const provider = createLocalProvider();
    const upsert = provider.applicants.upsert.bind(provider.applicants);
    const edit = vi.spyOn(provider.applicants, "upsert").mockImplementation(value => {
      if (value.nif === row(1).nif) throw new Error("Interruption");
      return upsert(value);
    });
    const first = await runContractImport(provider, input([row(0), row(1)]));
    expect(first.failures).toHaveLength(1);
    const dossier = loadDb().dossiers.find(d => d.id === first.contracts[0].dossierId)!;
    expect(readImportRequest("w", "import-1")?.dossierId).toBe(dossier.id);
    replaceLocalDossierId("w", dossier.id, { ...dossier, id: "server-dossier" });
    edit.mockImplementation(upsert);
    const retry = await runContractImport(provider, input([row(0), row(1)]));
    expect(retry.failures).toEqual([]);
    expect(retry.contracts.map(c => c.dossierId)).toEqual(["server-dossier", "server-dossier"]);
    expect(loadDb().contracts.filter(c => c.workspaceId === "w")).toHaveLength(2);
  });

  it("recognizes a lost duplicate-update receipt even when the folder ID was reconciled", async () => {
    const provider = createLocalProvider();
    const [old] = (await runContractImport(provider, input())).contracts;
    const original = provider.contracts.update.bind(provider.contracts);
    const update = vi.spyOn(provider.contracts, "update").mockImplementation(async value => {
      await original(value);
      throw new Error("Connection lost");
    });
    const attempt = { ...input([{ ...row(0), contractId: "replacement", duplicateResolution: { contractId: old.id, action: "keep" as const } }]),
      onDossierCreated: (id: string) => {
        const dossier = loadDb().dossiers.find(d => d.id === id)!;
        replaceLocalDossierId("w", id, { ...dossier, id: "server-dossier" });
      }
    };
    const result = await runContractImport(provider, attempt);
    expect(result.failures).toEqual([]);
    expect(result.contracts[0].dossierId).toBe("server-dossier");
    expect((await runContractImport(provider, attempt)).failures).toEqual([]);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not delete a reused server folder when all rows fail after folder reconciliation", async () => {
    const provider = createLocalProvider();
    const remove = vi.spyOn(provider.dossiers, "delete");
    vi.spyOn(provider.contracts, "create").mockRejectedValue(new Error("Refusé"));
    const result = await runContractImport(provider, { ...input(), onDossierCreated: id => {
      const dossier = loadDb().dossiers.find(d => d.id === id)!;
      replaceLocalDossierId("w", id, { ...dossier, id: "server-dossier" });
    } });
    expect(result.failures).toHaveLength(1);
    expect(remove).not.toHaveBeenCalled();
    expect(await provider.dossiers.getById("server-dossier")).not.toBeNull();
  });

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
    expect(result.failures).toEqual([]);
    expect(result.skipped).toEqual([{ contractId: "duplicate", skipped: true }]);
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

  it("ignores repeated rows and existing same-year contracts without modifying the existing contract", async () => {
    const provider = createLocalProvider();
    const dossier = vi.spyOn(provider.dossiers, "create");
    const applicant = vi.spyOn(provider.applicants, "upsert");
    const first = await runContractImport(provider, input([row(0), { ...row(0), contractId: "other" }]));
    expect(first.failures).toEqual([]);
    expect(first.contracts).toHaveLength(1);
    expect(first.skipped).toEqual([{ contractId: "other", skipped: true }]);
    dossier.mockClear(); applicant.mockClear();
    const second = await runContractImport(provider, input([{ ...row(0), contractId: "another-import", salaryNumber: 50000 }]));
    expect(second.failures).toEqual([]);
    expect(second.contracts).toEqual([]);
    expect(second.skipped).toEqual([{ contractId: "another-import", skipped: true }]);
    expect(await provider.contracts.getById(first.contracts[0].id)).toMatchObject(first.contracts[0]);
    expect(dossier).not.toHaveBeenCalled();
    expect(applicant).not.toHaveBeenCalled();
  });

  it("ignores a same-year duplicate discovered after a stale preflight and continues the import", async () => {
    const provider = createLocalProvider();
    const [old] = (await runContractImport(provider, input())).contracts;
    vi.spyOn(provider.contracts, "list").mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 10 });
    const onRowResult = vi.fn();
    const result = await runContractImport(provider, { ...input([{ ...row(0), contractId: "late-duplicate" }, row(1)]), onRowResult });
    expect(result.failures).toEqual([]);
    expect(result.contracts.map(c => c.id)).toEqual(["import-1"]);
    expect(result.skipped).toEqual([{ contractId: "late-duplicate", skipped: true }]);
    expect(onRowResult).toHaveBeenCalledWith({ contractId: "late-duplicate", skipped: true });
    expect((await provider.contracts.getById(old.id))?.salaryNumber).toBe(30000);
    expect(readImportRequest("w", "late-duplicate")).toBeNull();
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
