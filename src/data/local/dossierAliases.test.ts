import { beforeEach, expect, it } from "vitest";
import { LocalContractRepository } from "./localContractRepository";
import { LocalDossierRepository } from "./localDossierRepository";
import { getPendingOutbox, replaceLocalDossierId } from "./offlineStore";
import { queueOutbox, setOutboxError } from "./localOutbox";
import type { CreateContractInput } from "../types";

const input: CreateContractInput = { workspaceId: "w", applicantId: "123-456-789-0", nif: "123-456-789-0",
  gender: "Homme", firstName: "Jean", lastName: "Louis", address: "Delmas", status: "saisie", position: "Agent", assignment: "Centre",
  salaryNumber: 30000, salaryText: "TRENTE MILLE", durationMonths: 12, annee_fiscale: "2026-2027" };
beforeEach(() => localStorage.clear());

it("resolves successive folder aliases for new contracts, edits and assignments", async () => {
  const dossiers = new LocalDossierRepository(), contracts = new LocalContractRepository();
  const local = await dossiers.create({ workspaceId: "w", name: "Import" });
  replaceLocalDossierId("w", local.id, { ...local, id: "intermediate" });
  replaceLocalDossierId("w", "intermediate", { ...local, id: "server" });
  const contract = await contracts.create({ ...input, dossierId: local.id });
  expect(contract.dossierId).toBe("server");
  await contracts.update({ id: contract.id, dossierId: "intermediate" });
  await contracts.assignToDossier("w", [contract.id], local.id);
  expect(getPendingOutbox().filter(item => item.type.startsWith("contract.")).map(item => item.payload.dossierId)).toEqual(["server", "server", "server"]);
});

it("resolves queued and later folder edits without losing the contract's pending error", async () => {
  const dossiers = new LocalDossierRepository(), contracts = new LocalContractRepository();
  const local = await dossiers.create({ workspaceId: "w", name: "Import" });
  const contract = await contracts.create({ ...input, dossierId: local.id });
  const queued = getPendingOutbox().find(item => item.type === "contract.create")!;
  setOutboxError(queued.id, "Dossier inaccessible");
  await dossiers.update({ id: local.id, workspaceId: "w", comment: "Avant" });
  replaceLocalDossierId("w", local.id, { ...local, id: "server" });
  expect(getPendingOutbox().find(item => item.id === queued.id)).toMatchObject({ lastError: "Dossier inaccessible", payload: { dossierId: "server" } });
  expect(getPendingOutbox().find(item => item.type === "dossier.update")?.payload).toMatchObject({ id: "server", comment: "Avant", baseDossier: { id: "server" } });
  expect(await dossiers.update({ id: local.id, workspaceId: "w", comment: "Après" })).toMatchObject({ id: "server", comment: "Après" });
  await dossiers.delete(local.id, "w");
  expect(getPendingOutbox().find(item => item.type === "dossier.delete")?.payload.id).toBe("server");
  expect((await contracts.getById(contract.id))?.dossierId).toBeNull();
});

it("never resolves an alias into another workspace", async () => {
  const local = await new LocalDossierRepository().create({ workspaceId: "w", name: "Import" });
  expect(() => replaceLocalDossierId("w", local.id, { ...local, workspaceId: "other", id: "server" })).toThrow("Dossier inaccessible");
  replaceLocalDossierId("w", local.id, { ...local, id: "server" });
  const other = await new LocalContractRepository().create({ ...input, workspaceId: "other", dossierId: local.id });
  expect(other.dossierId).toBe(local.id);
  queueOutbox("other", "dossier.delete", { id: local.id });
  expect(getPendingOutbox().find(item => item.workspaceId === "other" && item.type === "dossier.delete")?.payload.id).toBe(local.id);
});
