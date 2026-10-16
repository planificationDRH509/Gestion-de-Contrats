import type { OutboxItem } from "../types";
import type { ReferenceChange } from "../local/referenceOverlay";
import { cacheSuggestions, type SuggestionsDb } from "../local/suggestionsDb";
import { cacheSalaryGrid } from "../../features/salary-grid/salaryGridCache";
import type { SalaryGridEntry } from "../../features/salary-grid/salaryGrid";
import { cacheInstitutionPrepositions, type InstitutionPrepositionRule } from "../../features/institutions/institutionPrepositions";
import { cacheMinisters } from "../../features/settings/ministersCache";
import type { MinisterRegistry } from "../../lib/ministers";
import { fetchAllPages } from "./fetchAllPages";
import { getSupabaseClient } from "./supabaseClient";

function session() {
  try { return JSON.parse(localStorage.getItem("contribution_auth") ?? "null") as { id: string; workspaceId: string; taskSessionToken?: string } | null; }
  catch { return null; }
}

/** Fetch authoritative baselines before dropping their optimistic overlays. */
export async function readReferenceRestoration(items: OutboxItem[], workspaceId: string): Promise<{ apply: () => void; missingMinisterIds: string[] }> {
  const references = items.filter(item => item.type === "reference.change");
  if (!references.length) return { apply: () => undefined, missingMinisterIds: [] };
  const user = session();
  if (!user?.id || user.workspaceId !== workspaceId || !user.taskSessionToken || references.some(item =>
    item.workspaceId !== workspaceId || item.actorId && item.actorId !== user.id)) throw new Error("Reconnectez le compte ayant modifié ce référentiel.");
  const assertSession = () => {
    const current = session();
    if (current?.id !== user.id || current.workspaceId !== workspaceId || current.taskSessionToken !== user.taskSessionToken) {
      throw new Error("La session a changé. Actualisez avant de réessayer.");
    }
  };
  const scopes = [...new Set(references.map(item => (item.payload as unknown as ReferenceChange).scope))];
  const snapshots = await Promise.all(scopes.map(async scope => {
    if (scope === "salary" || scope === "prepositions" || scope === "ministers") {
      const rpc = scope === "salary" ? "read_salary_grid" : scope === "prepositions" ? "read_institution_prepositions" : "read_ministers";
      const { data, error } = await getSupabaseClient().rpc(rpc, { p_session_token: user.taskSessionToken! });
      if (error) throw error;
      if (scope === "ministers") {
        const registry = data as unknown as MinisterRegistry;
        if (!Array.isArray(registry?.ministers) || !registry.ministers.some(minister => minister.id === registry.currentMinisterId)) {
          throw new Error("Liste des ministres indisponible.");
        }
      } else if (!Array.isArray(data)) throw new Error("Référentiel du serveur indisponible.");
      return { scope, data };
    }
    const types = { addresses: "address", positions: "position", institutions: "institution" } as const;
    if (!(scope in types)) throw new Error("Référentiel inconnu.");
    const query = getSupabaseClient().from("autocompletion").select("*", { count: "exact" })
      .eq("workspace_id", workspaceId).eq("type", types[scope])
      .order("order_index", { ascending: true }).order("id", { ascending: true });
    const rows = await fetchAllPages(async (from, to) => {
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Suggestions du serveur indisponibles.");
      return { items: data, total: count };
    });
    const data = rows.map(raw => {
      const row = raw as typeof raw & { prefix?: string | null; label_feminine?: string | null; salaries?: number[] | null };
      return { id: row.id, label: row.label, prefix: row.prefix,
      labelFeminine: row.label_feminine, order: row.order_index, version: row.version,
      ...(scope === "positions" ? { salaries: row.salaries || [] } : {}),
      ...(scope === "institutions" ? { department: row.department, commune: row.commune,
        institutionType: row.institution_type, source: row.source_url,
        addressKeywords: typeof row.address_keywords === "string" ? JSON.parse(row.address_keywords) : row.address_keywords || [] } : {}) };
    });
    return { scope, data };
  }));
  assertSession();
  const ministerSnapshot = snapshots.find(snapshot => snapshot.scope === "ministers")?.data as unknown as MinisterRegistry | undefined;
  const missingMinisterIds = ministerSnapshot ? [...new Set(references.filter(item => item.payload.scope === "ministers")
    .flatMap(item => (item.payload as unknown as ReferenceChange).patches)
    .filter(patch => !patch.before && patch.after && !ministerSnapshot.ministers.some(minister => minister.id === patch.id))
    .map(patch => patch.id))] : [];
  return { missingMinisterIds, apply() {
    assertSession();
    for (const { scope, data } of snapshots) {
      if (scope === "salary") cacheSalaryGrid(data as unknown as SalaryGridEntry[]);
      else if (scope === "prepositions") cacheInstitutionPrepositions(data as unknown as InstitutionPrepositionRule[]);
      else if (scope === "ministers") cacheMinisters(data as unknown as MinisterRegistry);
      else cacheSuggestions({ [scope]: data } as Partial<SuggestionsDb>, workspaceId);
    }
  } };
}
