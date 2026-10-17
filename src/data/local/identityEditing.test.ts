import { beforeEach, describe, expect, it } from "vitest";
import type { Applicant, Contract } from "../types";
import { ensureDefaultWorkspace, loadDb, saveDb } from "./localDb";
import { LocalApplicantRepository } from "./localApplicantRepository";
import { LocalContractRepository, updateContractWithApplicantOffline } from "./localContractRepository";
import { cacheApplicant, cacheApplicants, cacheContracts, captureIdentityCacheRevision, hasContractIdentityChangedSince, getPendingOutbox, removeOutboxItem, recordApplicantSyncAcknowledgement, replaceLocalApplicantId, replaceWorkspaceCache, upsertApplicantOffline } from "./offlineStore";
import { queueOutbox } from "./localOutbox";

const person: Applicant = { id: "111-222-333-4", nif: "111-222-333-4", ninu: "1234567890", workspaceId: "w",
  firstName: "Jean", lastName: "LOUIS", gender: "Homme", address: "Delmas", phone: "37123456",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const contract: Contract = { ...person, id: "contract", applicantId: person.id, status: "saisie", position: "Analyste",
  assignment: "Direction", durationMonths: 12, salaryNumber: 40000, salaryText: "QUARANTE MILLE", annee_fiscale: "2026-2027" };
function seed() {
  const db = loadDb();
  db.applicants = [person]; db.contracts = [contract]; db.outbox = []; db.contractLists = [];
  saveDb(db);
}
beforeEach(() => { localStorage.clear(); ensureDefaultWorkspace(); seed(); });

describe("contract identity edits", () => {
  it("renames the same identity and queues the original server key without losing an omitted NINU", async () => {
    const { ninu: _ninu, ...identity } = person;
    const updated = await updateContractWithApplicantOffline({ id: contract.id, workspaceId: "w", salaryNumber: 50000 },
      { ...identity, nif: "999-888-777-6" });
    expect(updated).toMatchObject({ id: contract.id, applicantId: "999-888-777-6", nif: "999-888-777-6", ninu: person.ninu, salaryNumber: 50000 });
    expect(loadDb().applicants).toEqual([expect.objectContaining({ id: "999-888-777-6", ninu: person.ninu, phone: person.phone })]);
    const pending = getPendingOutbox();
    expect(pending.map(item => item.type)).toEqual(["applicant.upsert", "contract.update"]);
    expect(pending[0].payload).toMatchObject({ id: person.id, nif: "999-888-777-6", baseApplicant: person });
    expect(pending[1].payload.baseContract).toMatchObject(contract);
  });

  it("updates NINU on every linked cached contract and protects it from a stale download", async () => {
    const db = loadDb(); db.contracts.push({ ...contract, id: "older", annee_fiscale: "2025-2026" }); saveDb(db);
    await new LocalApplicantRepository().upsert({ ...person, ninu: "9999999999" });
    cacheApplicant({ ...person, ninu: null });
    cacheContracts([{ ...contract, ninu: null }]);
    expect(loadDb().applicants[0].ninu).toBe("9999999999");
    expect(loadDb().contracts.map(item => item.ninu)).toEqual(["9999999999", "9999999999"]);
  });

  it.each(["NIF", "NINU"])("rejects a genuine %s duplicate before changing either identity or contract", async field => {
    const db = loadDb();
    db.applicants.push({ ...person, id: "999-888-777-6", nif: "999-888-777-6", ninu: "9999999999" }); saveDb(db);
    const before = loadDb();
    await expect(updateContractWithApplicantOffline({ id: contract.id, salaryNumber: 50000 }, {
      ...person, nif: field === "NIF" ? "999-888-777-6" : person.nif,
      ninu: field === "NINU" ? "9999999999" : person.ninu
    })).rejects.toThrow(`Le ${field}`);
    expect(loadDb()).toEqual(before);
  });

  it("does not save identity or queued writes if the contract edit fails validation", async () => {
    const before = loadDb();
    await expect(updateContractWithApplicantOffline({ id: contract.id, durationMonths: 13 }, { ...person, ninu: "9999999999" })).rejects.toThrow();
    expect(loadDb()).toEqual(before);
  });

  it("rejects a fiscal-year collision before saving the composite edit", async () => {
    const db = loadDb(); db.contracts.push({ ...contract, id: "existing", applicantId: "999-888-777-6", nif: "999-888-777-6" }); saveDb(db);
    const before = loadDb();
    await expect(updateContractWithApplicantOffline({ id: contract.id }, { ...person, nif: "999-888-777-6" })).rejects.toThrow(/année fiscale/);
    expect(loadDb()).toEqual(before);
  });

  it("does not reuse an identity from another workspace", () => {
    const before = loadDb();
    expect(() => upsertApplicantOffline({ ...person, workspaceId: "other", nif: "999-888-777-6" })).toThrow(/inaccessible/);
    expect(loadDb()).toEqual(before);
  });

  it("allows an explicit NINU removal while preserving an omitted NINU on other edits", async () => {
    const cleared = await new LocalApplicantRepository().upsert({ ...person, ninu: null });
    expect(cleared.ninu).toBeNull();
    expect(loadDb().contracts[0].ninu).toBeNull();
  });

  it("discards delayed identity and contract downloads even after the local edit was acknowledged", async () => {
    const requestRevision = captureIdentityCacheRevision();
    await updateContractWithApplicantOffline({ id: contract.id, salaryNumber: 50000 }, { ...person, ninu: "9999999999" });
    for (const item of getPendingOutbox()) removeOutboxItem(item.id);
    cacheApplicant({ ...person, ninu: null }, requestRevision);
    cacheApplicants([{ ...person, ninu: null }], requestRevision);
    cacheContracts([{ ...contract, ninu: null }], requestRevision);
    expect(loadDb().applicants[0].ninu).toBe("9999999999");
    expect(loadDb().contracts[0]).toMatchObject({ ninu: "9999999999", salaryNumber: 50000 });
    expect(hasContractIdentityChangedSince(contract, requestRevision)).toBe(true);
  });

  it("does not resurrect the old NIF when a workspace refresh completes after the rename ACK", async () => {
    const requestRevision = captureIdentityCacheRevision();
    await updateContractWithApplicantOffline({ id: contract.id }, { ...person, nif: "999-888-777-6" });
    for (const item of getPendingOutbox()) removeOutboxItem(item.id);
    replaceWorkspaceCache("w", { applicants: [person], contracts: [contract], dossiers: [], tags: [] }, requestRevision);
    expect(loadDb().applicants).toEqual([expect.objectContaining({ id: "999-888-777-6", ninu: person.ninu })]);
    expect(loadDb().contracts[0]).toMatchObject({ nif: "999-888-777-6", ninu: person.ninu });
  });

  it("does not restore a renamed source when a workspace read begins and ends while the rename is pending", async () => {
    await updateContractWithApplicantOffline({ id: contract.id }, { ...person, nif: "999-888-777-6" });
    const requestRevision = captureIdentityCacheRevision();
    const pending = getPendingOutbox();
    replaceWorkspaceCache("w", { applicants: [person], contracts: [contract], dossiers: [], tags: [] }, requestRevision);
    expect(loadDb().applicants).toEqual([expect.objectContaining({ id: "999-888-777-6", ninu: person.ninu })]);
    expect(loadDb().contracts[0]).toMatchObject({ nif: "999-888-777-6", ninu: person.ninu });
    expect(getPendingOutbox()).toEqual(pending);
  });

  it("fences stale reads that started while an edit was pending and finished after its ACK", async () => {
    await updateContractWithApplicantOffline({ id: contract.id }, { ...person, ninu: "9999999999" });
    const requestRevision = captureIdentityCacheRevision();
    for (const item of getPendingOutbox()) removeOutboxItem(item.id);
    recordApplicantSyncAcknowledgement({ ...person, ninu: "9999999999" }, [person.id, person.nif!]);
    cacheApplicant(person, requestRevision);
    cacheContracts([contract], requestRevision);
    expect(loadDb().applicants[0].ninu).toBe("9999999999");
    expect(loadDb().contracts[0].ninu).toBe("9999999999");
  });

  it("accepts a fresh later download and does not mark rejected edits as committed", async () => {
    const beforeRejected = captureIdentityCacheRevision();
    await expect(updateContractWithApplicantOffline({ id: contract.id, durationMonths: 13 }, { ...person, ninu: "9999999999" })).rejects.toThrow();
    expect(captureIdentityCacheRevision()).toBe(beforeRejected);
    await updateContractWithApplicantOffline({ id: contract.id }, { ...person, ninu: "9999999999" });
    for (const item of getPendingOutbox()) removeOutboxItem(item.id);
    const freshRevision = captureIdentityCacheRevision();
    cacheApplicant({ ...person, ninu: "8888888888" }, freshRevision);
    cacheContracts([{ ...contract, ninu: "8888888888" }], freshRevision);
    expect(loadDb().applicants[0].ninu).toBe("8888888888");
    expect(loadDb().contracts[0].ninu).toBe("8888888888");
  });

  it("keeps the source key for successive offline renames and updates dependent unsent contracts", async () => {
    const db = loadDb(); db.applicants = []; db.contracts = []; saveDb(db);
    upsertApplicantOffline(person);
    await new LocalContractRepository().create({ ...contract, id: "new" });
    upsertApplicantOffline({ ...person, nif: "999-888-777-6" });
    upsertApplicantOffline({ ...person, id: "999-888-777-6", nif: "777-888-999-0", ninu: "9999999999" });
    const pending = getPendingOutbox();
    expect(pending).toHaveLength(2);
    expect(pending[0].payload).toMatchObject({ id: person.id, nif: "777-888-999-0", baseApplicant: null });
    expect(pending[1].payload).toMatchObject({ applicantId: "777-888-999-0", nif: "777-888-999-0", ninu: "9999999999" });
    expect(loadDb().applicants).toHaveLength(1);
  });

  it("preserves chronological identity steps around a queued list operation", () => {
    upsertApplicantOffline({ ...person, nif: "999-888-777-6" });
    queueOutbox("w", "list.operation", { applicantIds: ["999-888-777-6"], contractIds: [contract.id] });
    upsertApplicantOffline({ ...person, id: "999-888-777-6", nif: "777-888-999-0" });
    const pending = getPendingOutbox();
    expect(pending.map(item => item.type)).toEqual(["applicant.upsert", "list.operation", "applicant.upsert"]);
    expect(pending[0].payload).toMatchObject({ id: person.id, nif: "999-888-777-6" });
    expect(pending[2].payload).toMatchObject({ id: "999-888-777-6", nif: "777-888-999-0" });
  });

  it("rebases an in-flight rename ACK without overwriting a newer pending NIF or NINU", () => {
    upsertApplicantOffline({ ...person, nif: "999-888-777-6" });
    const inflight = getPendingOutbox()[0];
    upsertApplicantOffline({ ...person, id: "999-888-777-6", nif: "777-888-999-0", ninu: "9999999999" });
    removeOutboxItem(inflight.id);
    replaceLocalApplicantId("w", person.id, { ...person, id: "999-888-777-6", nif: "999-888-777-6" });
    cacheApplicant({ ...person, id: "999-888-777-6", nif: "999-888-777-6" });
    expect(loadDb().applicants).toEqual([expect.objectContaining({ id: "777-888-999-0", ninu: "9999999999" })]);
    expect(getPendingOutbox()[0].payload).toMatchObject({ id: "999-888-777-6", nif: "777-888-999-0", ninu: "9999999999" });
    expect(loadDb().contracts[0]).toMatchObject({ applicantId: "777-888-999-0", ninu: "9999999999" });
  });
});
