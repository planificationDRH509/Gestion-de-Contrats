import { afterEach, expect, it, vi } from "vitest";
import { createSupabaseProvider } from "./supabaseProvider";
import { contractEditFields, mergeOfflinePatch } from "./offlineConflict";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("sends the refreshed creation date, destination and replacement note together", async () => {
  localStorage.clear();
  vi.stubGlobal("navigator", { onLine: true });
  let row = {
    id_contrat: "old", workspace_id: "w", nif: "123-456-789-0", titre: "Agent", lieu_affectation: "MSPP",
    salaire_en_chiffre: 30000, duree_contrat: 12, annee_fiscale: "2026-2027", deleted_at: null,
    dossier_id: "old-folder", status: "saisie", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    identification: { nom: "LOUIS", prenom: "Jean", sexe: "Homme", adresse: "Delmas" }, contract_tags: []
  };
  mocks.from.mockImplementation(() => {
    const query = {
      select: () => query, eq: () => query, is: () => query,
      update: (payload: Record<string, unknown>) => { mocks.update(payload); row = { ...row, ...payload }; return query; },
      maybeSingle: async () => ({ data: row, error: null })
    };
    return query;
  });
  const createdAt = "2026-10-11T12:00:00.000Z";
  const saved = await createSupabaseProvider().contracts.update({ id: "old", dossierId: "new-folder", createdAt, annee_fiscale: "2026-2027", salaryNumber: 50000, commentaire: "Ancien contrat : 30000" });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ created_at: createdAt, dossier_id: "new-folder", salaire_en_chiffre: 50000, commentaire: "Ancien contrat : 30000" }));
  expect(saved).toMatchObject({ createdAt, dossierId: "new-folder", salaryNumber: 50000 });
});

it("includes the refreshed date and fiscal year when synchronizing an offline import", () => {
  const before: { createdAt: string; annee_fiscale: string | null; dossierId: string; commentaire: string | null } = { createdAt: "2026-09-01", annee_fiscale: null, dossierId: "old", commentaire: null };
  const patch = { createdAt: "2026-10-11", annee_fiscale: "2025-2026", dossierId: "new", commentaire: "Ancien contrat" };
  expect(mergeOfflinePatch<Record<string, unknown>>(patch, before, before, contractEditFields)).toEqual(patch);
});
