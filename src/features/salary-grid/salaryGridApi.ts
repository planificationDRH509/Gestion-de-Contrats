import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth';
import { getSupabaseClient } from '../../data/supabase/supabaseClient';
import type { Json } from '../../data/supabase/database.types';
import seed from './salaryGridSeed.json';
import { SalaryGridEntry, validateGridEntry } from './salaryGrid';

import { salaryGridRemote as remote, readSalaryGridCache as cached, cacheSalaryGrid as cache } from "./salaryGridCache";

export function useSalaryGrid() {
  const { user, can } = useAuth();
  const client = useQueryClient();
  const queryKey = ['salary-grid', user?.id ?? ''];
  const query = useQuery<SalaryGridEntry[]>({
    queryKey, enabled: Boolean(user),
    initialData: () => cached() ?? (remote ? undefined : seed), initialDataUpdatedAt: 0,
    staleTime: 30_000, refetchOnReconnect: 'always', refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!remote) return cached() ?? seed;
      if (!user?.taskSessionToken) throw new Error('Session utilisateur indisponible.');
      const { data, error } = await getSupabaseClient().rpc('read_salary_grid', { p_session_token: user.taskSessionToken });
      if (error) throw error;
      const entries = data as unknown as SalaryGridEntry[];
      cache(entries);
      return entries;
    }
  });
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: async (entry: SalaryGridEntry) => {
      if (!can('settings.manage')) throw new Error('Modification réservée aux administrateurs.');
      validateGridEntry(entry);
      if (!remote) {
        const entries = cached() ?? seed;
        const previous = entries.find(e => e.id === entry.id);
        if (previous && previous.version !== entry.version) throw new Error('Cette ligne a changé. Rechargez la grille.');
        return [...entries.filter(e => e.id !== entry.id), {...entry, version: entry.version + 1}];
      }
      if (!navigator.onLine) throw new Error('Connectez-vous pour modifier la grille salariale.');
      if (!user?.taskSessionToken) throw new Error('Session utilisateur indisponible.');
      const { data, error } = await getSupabaseClient().rpc('save_salary_grid_entry', {
        p_session_token: user.taskSessionToken, p_entry: entry as unknown as Json
      });
      if (error) throw error;
      return data as unknown as SalaryGridEntry[];
    },
    onSuccess: entries => { cache(entries); client.setQueryData(queryKey, entries); void client.invalidateQueries({queryKey:['salary-grid']}); }
  });
  return { ...query, entries: query.data ?? [], save: mutation.mutateAsync, saving: mutation.isPending };
}
