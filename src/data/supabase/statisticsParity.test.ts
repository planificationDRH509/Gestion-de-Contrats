import { beforeEach, expect, it, vi } from "vitest";
import { createSupabaseProvider } from "./supabaseProvider";
import { replaceWorkspaceCache, getWorkspaceSyncMetadata } from "../local/offlineStore";
import { calculateFinancialStatistics } from "../../features/statistics/financialStatistics";

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mock.from }) }));
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
  query.range = vi.fn(async (from: number, to: number) => ({
    data: data.slice(from, Math.min(to + 1, from + 127)), count: data.length, error: null
  }));
  query.then = (resolve: any) => Promise.resolve({ data, error: null }).then(resolve);
  return query;
}
beforeEach(() => {
  localStorage.clear();
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
