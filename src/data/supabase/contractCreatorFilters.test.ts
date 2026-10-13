import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ContractListParams } from "../types";
import { createSupabaseProvider } from "./supabaseProvider";

const mocks = vi.hoisted(() => ({ from: vi.fn(), inFilter: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
const workspaceId = "creator-filters";
const rows = ["me", "alice", "bob", "bob", "charlie", null, "alice", "alice"].map((creator, index) => ({
  id_contrat: `contract-${index}`, workspace_id: index === 7 ? "another-workspace" : workspaceId,
  nif: `person-${index}`, created_by: creator, titre: "Analyste", lieu_affectation: "Direction",
  salaire_en_chiffre: 30000, duree_contrat: index === 3 ? 12 : 6, annee_fiscale: "2025-2026",
  deleted_at: index === 6 ? "2026-01-02" : null, dossier_id: null, contract_tags: [],
  status: index === 3 ? "signe" : "saisie", created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-01T12:00:00Z",
  identification: { nom: "LOUIS", prenom: `Jean ${index}`, sexe: "Homme", adresse: "Delmas" }
}));

beforeEach(() => {
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
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each([false, true])("combines creators with filters before pagination online and offline (date/search=%s)", async withClientFilters => {
  const provider = createSupabaseProvider();
  expect((await provider.contracts.list({ workspaceId, pageSize: 25 })).total).toBe(6);
  const params: ContractListParams = {
    workspaceId, createdByIds: ["alice", "bob"], status: "saisie", durations: [6],
    assignments: ["Direction"], positions: ["Analyste"], pageSize: 1, page: 2,
    ...(withClientFilters ? { fiscalYear: "2025-2026", query: "Jean", dateFilterMode: "day", dateFilterDate: "2026-01-01" } : {})
  };
  const connected = await provider.contracts.list(params);
  expect(mocks.inFilter).toHaveBeenCalledWith("created_by", ["alice", "bob"]);
  expect(connected.total).toBe(2);
  expect(connected.items.map(contract => contract.id)).toEqual(["contract-2"]);
  vi.stubGlobal("navigator", { onLine: false });
  expect(await provider.contracts.list(params)).toEqual(connected);
});

it.each([true, false])("handles single, multiple, empty and unknown creators without including other workspaces or deleted rows (online=%s)", async onLine => {
  const provider = createSupabaseProvider();
  await provider.contracts.list({ workspaceId, pageSize: 25 });
  vi.stubGlobal("navigator", { onLine });
  for (const [createdByIds, ids] of [
    [["alice"], ["contract-1"]],
    [["alice", "bob"], ["contract-1", "contract-2", "contract-3"]],
    [["missing"], []],
    [[], rows.slice(0, 6).map(row => row.id_contrat)]
  ]) {
    const result = await provider.contracts.list({ workspaceId, createdByIds, pageSize: 25 });
    expect(result.items.map(contract => contract.id)).toEqual(ids);
    expect(result.total).toBe(ids.length);
  }
});
