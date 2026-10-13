import type { OutboxItem } from '../types';
import type { Json } from './database.types';
import { getSupabaseClient } from './supabaseClient';
import { loadDb, saveDb, flushLocalDbWrites } from '../local/localDb';
import type { ReferenceChange, ReferenceEntry } from '../local/referenceOverlay';
import { cacheSuggestions, loadSuggestions, type SuggestionsDb } from '../local/suggestionsDb';
import { cacheSalaryGrid } from '../../features/salary-grid/salaryGridCache';
import type { SalaryGridEntry } from '../../features/salary-grid/salaryGrid';
import { cacheInstitutionPrepositions, type InstitutionPrepositionRule } from '../../features/institutions/institutionPrepositions';
import { cacheMinisters } from '../../features/settings/ministersCache';
import type { MinisterRegistry } from '../../lib/ministers';

export async function syncReferenceChange(item: OutboxItem) {
  const actor = JSON.parse(localStorage.getItem('contribution_auth') ?? 'null');
  if (!actor?.taskSessionToken || actor.id !== item.actorId || actor.workspaceId !== item.workspaceId) throw new Error('Reconnectez le compte ayant modifié ce référentiel.');
  const change = item.payload as unknown as ReferenceChange;
  const { data, error } = await getSupabaseClient().rpc('sync_reference_change', {
    p_session_token: actor.taskSessionToken, p_operation_id: item.id, p_workspace_id: item.workspaceId,
    p_change: item.payload as Json
  });
  if (error) throw Object.assign(new Error(error.message), { cause: error });
  // Persist the acknowledgement before removing the durable operation. Cached
  // readers continue to overlay any newer edits made while the RPC was in flight.
  if (change.scope === 'salary') cacheSalaryGrid(data as unknown as SalaryGridEntry[]);
  else if (change.scope === 'prepositions') cacheInstitutionPrepositions(data as unknown as InstitutionPrepositionRule[]);
  else if (change.scope === 'ministers') cacheMinisters(data as unknown as MinisterRegistry);
  else {
    const scope = change.scope;
    const patch = change.patches[0];
    const saved = data as ReferenceEntry | null;
    const raw = loadSuggestions();
    const entries = raw[scope].filter(entry => entry.id !== patch.id && entry.id !== saved?.id);
    if (saved) entries.push(saved as never);
    cacheSuggestions({ [scope]: entries } as Partial<SuggestionsDb>);
    const db = loadDb();
    if (saved && saved.id !== patch.id) {
      for (const pending of db.outbox) {
        if (pending.id === item.id || pending.type !== 'reference.change' || pending.workspaceId !== item.workspaceId || pending.payload.scope !== scope) continue;
        for (const next of (pending.payload as unknown as ReferenceChange).patches) {
          if (next.id !== patch.id) continue;
          next.id = String(saved.id);
          const offset = Number(saved.version ?? 0) - Number(patch.after?.version ?? 0);
          if (next.before) next.before = { ...next.before, id: saved.id, version: Number(next.before.version ?? 0) + offset };
          if (next.after) next.after = { ...next.after, id: saved.id, version: Number(next.after.version ?? 0) + offset };
        }
      }
    }
    // The institution RPC also renames existing contract assignments.
    if (scope === 'institutions' && patch.before && saved && patch.before.label !== saved.label) {
      db.contracts = db.contracts.map(contract => contract.workspaceId === item.workspaceId && contract.assignment === patch.before!.label
        ? { ...contract, assignment: String(saved.label) } : contract);
    }
    saveDb(db);
    await flushLocalDbWrites();
  }
}
