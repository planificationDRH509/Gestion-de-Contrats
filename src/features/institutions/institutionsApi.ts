import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth';
import { useInstitutions } from '../settings/suggestionsApi';
import { getSupabaseClient } from '../../data/supabase/supabaseClient';
import { sqliteApiRequest } from '../../data/local/sqliteApiClient';
import { cacheSuggestions, getInstitutions, type InstitutionSuggestion } from '../../data/local/suggestionsDb';
import type { Json } from '../../data/supabase/database.types';
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
      if (!navigator.onLine) throw new Error('Connectez-vous pour modifier les institutions.');
      validateInstitution(entry, query.data ?? []);
      const payload = {...entry, label: entry.label.trim(), department: entry.department ? DEPARTMENTS.find(d => normalizeInstitution(d) === normalizeInstitution(entry.department!)) ?? null : null, commune: entry.commune?.trim() || null, source: entry.source?.trim() || null};
      if ((import.meta.env.VITE_DATA_PROVIDER ?? 'local') !== 'supabase') {
        return sqliteApiRequest<InstitutionSuggestion>('/institutions', {method:'POST',body:{workspaceId,entry:payload}});
      }
      if (!user?.taskSessionToken) throw new Error('Session utilisateur indisponible.');
      const {data, error} = await getSupabaseClient().rpc('save_institution', {
        p_session_token:user.taskSessionToken, p_workspace_id:workspaceId, p_entry:payload as unknown as Json
      });
      if (error) throw error;
      return data as unknown as InstitutionSuggestion;
    },
    onSuccess: entry => {
      const entries = client.getQueryData<InstitutionSuggestion[]>(['suggestions','institutions',workspaceId]) ?? getInstitutions();
      const next = [...entries.filter(e => e.id !== entry.id),entry];
      cacheSuggestions({institutions:next});
      client.setQueryData(['suggestions','institutions',workspaceId],next);
      void client.invalidateQueries({queryKey:['suggestions','institutions']});
      void client.invalidateQueries({queryKey:['contracts']});
      void client.invalidateQueries({queryKey:['contract']});
      void client.invalidateQueries({queryKey:['contract-lists']});
      void client.invalidateQueries({queryKey:['statistics']});
    }
  });
  return {...query, entries:query.data ?? [], save:mutation.mutateAsync, saving:mutation.isPending};
}
