import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSupabaseProvider, syncSupabaseWorkspace } from "./supabaseProvider";
import { replaceWorkspaceCache, getWorkspaceSyncMetadata, setWorkspaceSyncMetadata } from "../local/offlineStore";
import { calculateFinancialStatistics } from "../../features/statistics/financialStatistics";

import * as offlineStore from "../local/offlineStore";
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mock.from, rpc: mock.rpc }) }));
const workspaceId = "statistics-parity";
const rows = Array.from({ length: 5207 }, (_, i) => ({
  id_contrat: `contract-${i}`, workspace_id: workspaceId, nif: `person-${i}`,
  titre: "Analyste", lieu_affectation: "Direction", salaire_en_chiffre: 30000,
  salaire: "trente mille", duree_contrat: 12, annee_fiscale: "2025-2026",
  status: "saisie", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  identification: { nom: "LOUIS", prenom: `Jean ${i}`, sexe: "Homme", adresse: "Delmas" }
}));
const people = rows.map(r => ({ ...r.identification, nif: r.nif, workspace_id: workspaceId, created_at: r.created_at, updated_at: r.updated_at }));
function online(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}
function paged(data: unknown[]) {
  const query: any = {};
  for (const method of ["select", "eq", "is", "order"]) query[method] = () => query;
  query.not = () => { data = []; return query; };
  query.range = vi.fn(async (from: number, to: number) => ({
    data: data.slice(from, Math.min(to + 1, from + 127)), count: data.length, error: null
  }));
  query.then = (resolve: any) => Promise.resolve({ data, error: null }).then(resolve);
  return query;
}
beforeEach(() => {
  localStorage.clear();
  mock.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === "get_offline_workspace_revision" ? "same-revision" : [], error: null }));
  online(true);
  mock.from.mockImplementation((table: string) => paged(
    table === "contrat" ? rows : table === "identification" ? people : []
  ));
});

it("keeps all 5207 contracts, identities and financial totals when going offline", async () => {
  const provider = createSupabaseProvider();
  const connected = await provider.contracts.list({ workspaceId, all: true });
  expect(connected.items).toHaveLength(5207);
  expect(connected.total).toBe(5207);
  expect(getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt).toBeTruthy();
  online(false);
  const disconnected = await provider.contracts.list({ workspaceId, all: true });
  expect(disconnected).toEqual(connected);
  expect(calculateFinancialStatistics(disconnected.items, "2025-2026"))
    .toEqual(calculateFinancialStatistics(connected.items, "2025-2026"));
  expect(await provider.applicants.list(workspaceId)).toHaveLength(5207);
});

it("removes contracts deleted remotely from the offline snapshot", async () => {
  const provider = createSupabaseProvider();
  const first = await provider.contracts.list({ workspaceId, all: true });
  replaceWorkspaceCache(workspaceId, { applicants: [], dossiers: [], tags: [], contracts: first.items });
  mock.from.mockImplementation((table: string) => paged(table === "contrat" ? rows.slice(1) : []));
  expect((await provider.contracts.list({ workspaceId, all: true })).total).toBe(5207);
  await syncSupabaseWorkspace(workspaceId, { verify: true });
  const refreshed = await provider.contracts.list({ workspaceId, all: true });
  expect(refreshed.total).toBe(5206);
  online(false);
  expect(await provider.contracts.list({ workspaceId, all: true })).toEqual(refreshed);
});

it("fulfills large paginated requests despite the server response cap", async () => {
  const result = await createSupabaseProvider().contracts.list({ workspaceId, page: 2, pageSize: 2000 });
  expect(result.items).toHaveLength(2000);
  expect(result.items.map(item => item.id)).toEqual(
    rows.map(row => row.id_contrat).sort((a, b) => a.localeCompare(b)).slice(2000, 4000)
  );
  expect(result.total).toBe(5207);
});

afterEach(() => vi.restoreAllMocks());

it("repairs an older incomplete snapshot even when its remote revision matches", async () => {
  const provider = createSupabaseProvider();
  mock.from.mockImplementation((table: string) => paged(table === "contrat" ? rows.slice(0, 256) : []));
  await provider.contracts.list({ workspaceId, pageSize: 151, fiscalYear: "2025-2026" });
  setWorkspaceSyncMetadata(workspaceId, { lastFullSyncedAt: new Date().toISOString(), lastTrashSyncedAt: new Date().toISOString(), remoteRevision: "same-revision" });
  localStorage.setItem("contribution_auth", JSON.stringify({ workspaceId, taskSessionToken: "session" }));
  expect((await provider.contracts.list({ workspaceId, all: true })).total).toBe(151);
  await syncSupabaseWorkspace(workspaceId, { verify: true });
  expect((await provider.contracts.list({ workspaceId, all: true })).total).toBe(256);
  expect(getWorkspaceSyncMetadata(workspaceId).snapshotVersion).toBe(1);
});

it("does not mark a discarded snapshot as successfully synchronized", async () => {
  mock.from.mockImplementation((table: string) => paged(table === "contrat" ? rows.slice(0, 256) : []));
  vi.spyOn(offlineStore, "replaceWorkspaceCache").mockImplementationOnce(() => undefined);
  await expect(syncSupabaseWorkspace(workspaceId, { force: true })).rejects.toThrow("Enregistrement local incomplet");
  expect(getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt).toBeFalsy();
  expect(getWorkspaceSyncMetadata(workspaceId).snapshotVersion).toBeUndefined();
});
