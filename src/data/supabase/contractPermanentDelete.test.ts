import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Contract } from "../types";
import { cacheContracts } from "../local/offlineStore";
import { loadDb, saveDb } from "../local/localDb";
import { queueOutbox } from "../local/localOutbox";
import { createSupabaseProvider } from "./supabaseProvider";

const mocks = vi.hoisted(() => ({ from: vi.fn(), deleted: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
const contract: Contract = {
  id: "trash-contract", workspaceId: "trash-workspace", applicantId: "person", status: "saisie",
  gender: "Femme", firstName: "Marie", lastName: "Jean", nif: "111-222-333-4", address: "Delmas",
  position: "Analyste", assignment: "Direction", salaryNumber: 30000, salaryText: "TRENTE MILLE",
  durationMonths: 12, createdAt: "2026-10-01", updatedAt: "2026-10-11", deletedAt: "2026-10-11"
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("navigator", { onLine: true });
  cacheContracts([contract]);
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function mockDelete(row: { id_contrat: string; workspace_id: string; deleted_at: string | null } | null,
  error: { message: string } | null = null) {
  mocks.from.mockImplementation(() => {
    let matches = Boolean(row);
    const query = {
      delete: () => { mocks.deleted(); return query; },
      eq: (field: string, value: unknown) => { matches &&= row?.[field as keyof typeof row] === value; return query; },
      not: (field: string, operator: string, value: unknown) => {
        expect([field, operator, value]).toEqual(["deleted_at", "is", null]);
        matches &&= row?.deleted_at != null; return query;
      },
      select: () => query,
      maybeSingle: async () => ({ data: matches && !error ? { id_contrat: row!.id_contrat } : null, error })
    };
    return query;
  });
}

it("deletes a trashed contract remotely and removes the offline copy and tag links", async () => {
  mockDelete({ id_contrat: contract.id, workspace_id: contract.workspaceId, deleted_at: contract.deletedAt! });
  const db = loadDb();
  db.contractTags.push({ contractId: contract.id, tagId: "tag", createdAt: "2026-10-01" });
  saveDb(db);
  await createSupabaseProvider().contracts.permanentlyDelete(contract.id, contract.workspaceId);
  expect(mocks.deleted).toHaveBeenCalledOnce();
  expect(loadDb().contracts.some(item => item.id === contract.id)).toBe(false);
  expect(loadDb().contractTags.some(item => item.contractId === contract.id)).toBe(false);
  vi.stubGlobal("navigator", { onLine: false });
  expect((await createSupabaseProvider().contracts.list({ workspaceId: contract.workspaceId, deletionState: "deleted", all: true })).items).toEqual([]);
});

it.each([
  { id_contrat: contract.id, workspace_id: contract.workspaceId, deleted_at: null },
  { id_contrat: contract.id, workspace_id: "another-workspace", deleted_at: "2026-10-11" },
  null
])("keeps the offline copy when the remote contract is active, inaccessible or missing: %j", async row => {
  mockDelete(row);
  await expect(createSupabaseProvider().contracts.permanentlyDelete(contract.id, contract.workspaceId)).rejects.toThrow(/corbeille/);
  expect(loadDb().contracts.some(item => item.id === contract.id)).toBe(true);
});

it("keeps the contract on permission or network failures", async () => {
  const row = { id_contrat: contract.id, workspace_id: contract.workspaceId, deleted_at: "2026-10-11" };
  for (const message of ["permission denied", "Failed to fetch"]) {
    mockDelete(row, { message });
    await expect(createSupabaseProvider().contracts.permanentlyDelete(contract.id, contract.workspaceId)).rejects.toThrow(/Impossible/);
    expect(loadDb().contracts.some(item => item.id === contract.id)).toBe(true);
  }
});

it("requires a connection and never queues a permanent deletion", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  await expect(createSupabaseProvider().contracts.permanentlyDelete(contract.id, contract.workspaceId)).rejects.toThrow(/connexion/);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(loadDb().outbox).toEqual([]);
  expect(loadDb().contracts.some(item => item.id === contract.id)).toBe(true);
});

it("blocks deletion while contract changes cannot be synchronized", async () => {
  queueOutbox(contract.workspaceId, "contract.update", { id: contract.id, status: "signe" });
  mocks.from.mockImplementation(() => { throw new Error("permission denied"); });
  await expect(createSupabaseProvider().contracts.permanentlyDelete(contract.id, contract.workspaceId)).rejects.toThrow(/Synchronisez/);
  expect(mocks.deleted).not.toHaveBeenCalled();
  expect(loadDb().contracts.some(item => item.id === contract.id)).toBe(true);
  expect(loadDb().outbox).toHaveLength(1);
});
