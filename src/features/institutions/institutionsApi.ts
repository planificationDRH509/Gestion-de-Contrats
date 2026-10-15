import { queueReferenceChange } from '../../data/local/referenceQueue';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth';
import { useInstitutions } from '../settings/suggestionsApi';
import { sqliteApiRequest } from '../../data/local/sqliteApiClient';
import { cacheSuggestions, getInstitutions, type InstitutionSuggestion } from '../../data/local/suggestionsDb';
import { DEPARTMENTS, normalizeInstitution, validateInstitution } from './institutions';

export function useInstitutionCatalogue() {
  const { user, can } = useAuth();
  const workspaceId = user?.workspaceId ?? '';
  const query = useInstitutions(workspaceId);
  const client = useQueryClient();
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: async (entry: InstitutionSuggestion) => {
      if (!can('settings.manage')) throw new Error('Modification réservée aux administrateurs.');
      validateInstitution(entry, query.data ?? []);
      const payload = {...entry, label: entry.label.trim(), prefix: entry.prefix?.trim() || null, department: entry.department ? DEPARTMENTS.find(d => normalizeInstitution(d) === normalizeInstitution(entry.department!)) ?? null : null, commune: entry.commune?.trim() || null, source: entry.source?.trim() || null};
      if ((import.meta.env.VITE_DATA_PROVIDER ?? 'local') !== 'supabase') {
        return sqliteApiRequest<InstitutionSuggestion>('/institutions', {method:'POST',body:{workspaceId,entry:payload}});
      }
      const before = getInstitutions().find(item => item.id === entry.id) ?? null;
      if ((before?.version ?? 0) !== entry.version) throw new Error('Cette institution a changé. Rechargez la liste.');
      const after = { ...payload, version: (entry.version ?? 0) + 1 };
      await queueReferenceChange(workspaceId, { scope: 'institutions', patches: [{ id: entry.id, before, after }] });
      return after;
    },
    onSuccess: entry => {
      const entries = client.getQueryData<InstitutionSuggestion[]>(['suggestions','institutions',workspaceId]) ?? getInstitutions();
      const next = [...entries.filter(e => e.id !== entry.id),entry];
      if ((import.meta.env.VITE_DATA_PROVIDER ?? 'local') !== 'supabase') cacheSuggestions({institutions:next});
      client.setQueryData(['suggestions','institutions',workspaceId],next);
      void client.invalidateQueries({queryKey:['suggestions','institutions']});
      void client.invalidateQueries({queryKey:['contracts']});
      void client.invalidateQueries({queryKey:['contract']});
      void client.invalidateQueries({queryKey:['contract-lists']});
      void client.invalidateQueries({queryKey:['statistics']});
    }
  });
  const deletion = useMutation({
    networkMode: 'always',
    onMutate: () => client.cancelQueries({ queryKey: ['suggestions','institutions',workspaceId] }),
    mutationFn: async (entry: InstitutionSuggestion) => {
      if (!can('settings.manage')) throw new Error('Suppression réservée aux administrateurs.');
      const before = getInstitutions().find(item => item.id === entry.id);
      if (!before || (before.version ?? 1) !== (entry.version ?? 1)) throw new Error('Cette institution a changé. Rechargez la liste.');
      if ((import.meta.env.VITE_DATA_PROVIDER ?? 'local') !== 'supabase') {
        await sqliteApiRequest('/institutions', { method: 'DELETE', body: { workspaceId, id: entry.id, version: entry.version ?? 1 } });
      } else {
        await queueReferenceChange(workspaceId, { scope: 'institutions', patches: [{ id: entry.id, before, after: null }] });
      }
      return entry.id;
    },
    onSuccess: id => {
      const current = client.getQueryData<InstitutionSuggestion[]>(['suggestions','institutions',workspaceId]) ?? getInstitutions();
      const next = current.filter(entry => entry.id !== id);
      if ((import.meta.env.VITE_DATA_PROVIDER ?? 'local') !== 'supabase') cacheSuggestions({ institutions: next });
      client.setQueryData(['suggestions','institutions',workspaceId], next);
      void client.invalidateQueries({ queryKey: ['suggestions','institutions'] });
    }
  });
  return {...query, entries:query.data ?? [], save:mutation.mutateAsync, saving:mutation.isPending,
    remove:deletion.mutateAsync, deleting:deletion.isPending};
}
