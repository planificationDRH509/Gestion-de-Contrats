import { afterEach, expect, it, vi } from "vitest";
import { createSupabaseProvider } from "./supabaseProvider";

const mocks = vi.hoisted(() => ({ from: vi.fn(), inFilter: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
const workspaceId = "duration-filters";
const rows = [6, 6, 9, 12].map((duration, index) => ({
  id_contrat: `contract-${index}`, workspace_id: workspaceId, nif: `person-${index}`,
  titre: "Analyste", lieu_affectation: "Direction", salaire_en_chiffre: 30000,
  duree_contrat: duration, annee_fiscale: "2025-2026", deleted_at: null, dossier_id: null, contract_tags: [],
  status: index === 1 ? "signe" : "saisie", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  identification: { nom: "LOUIS", prenom: `Jean ${index}`, sexe: "Homme", adresse: "Delmas" }
}));
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("filters durations before pagination with the same totals online and offline", async () => {
  localStorage.clear();
  vi.stubGlobal("navigator", { onLine: true });
  mocks.from.mockImplementation(() => {
    let matching: Record<string, unknown>[] = [...rows];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { matching = matching.filter(row => row[key] === value); return query; },
      is: (key: string, value: unknown) => { matching = matching.filter(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => {
        mocks.inFilter(key, values);
        matching = matching.filter(row => values.includes(row[key])); return query;
      },
      order: () => query,
      range: async (from: number, to: number) => ({ data: matching.slice(from, to + 1), count: matching.length, error: null })
    };
    return query;
  });
  const provider = createSupabaseProvider();
  // Warm the full local cache through the paginated remote path.
  expect((await provider.contracts.list({ workspaceId, pageSize: 25 })).total).toBe(4);
  const params = { workspaceId, durations: [6, 12], status: "saisie" as const, pageSize: 1, page: 2 };
  const connected = await provider.contracts.list(params);
  expect(mocks.inFilter).toHaveBeenCalledWith("duree_contrat", [6, 12]);
  expect(connected.total).toBe(2);
  expect(connected.items.map(contract => contract.durationMonths)).toEqual([12]);
  expect((await provider.contracts.list({ workspaceId, durations: [3] })).total).toBe(0);
  vi.stubGlobal("navigator", { onLine: false });
  expect(await provider.contracts.list(params)).toEqual(connected);
  expect((await provider.contracts.list({ workspaceId, durations: [3] })).total).toBe(0);
  expect((await provider.contracts.list({ workspaceId, durations: [] })).total).toBe(4);
});
