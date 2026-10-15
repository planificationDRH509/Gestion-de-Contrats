import { queueReferenceChange } from '../../data/local/referenceQueue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth';
import { getSupabaseClient } from '../../data/supabase/supabaseClient';
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
    queryFn: async ({ signal }) => {
      const local = cached();
      if (local) client.setQueryData(queryKey, local);
      if (!navigator.onLine && local) return local;
      if (!remote) return cached() ?? seed;
      if (!user?.taskSessionToken) throw new Error('Session utilisateur indisponible.');
      const { data, error } = await getSupabaseClient().rpc('read_salary_grid', { p_session_token: user.taskSessionToken });
      if (error) throw error;
      const entries = data as unknown as SalaryGridEntry[];
      if (signal.aborted) return cached() ?? [];
      cache(entries);
      return cached() ?? entries;
    }
  });
  const mutation = useMutation({
    onMutate: () => client.cancelQueries({ queryKey }),
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
      const previous = cached()?.find(e => e.id === entry.id) ?? null;
      if ((previous?.version ?? 0) !== entry.version) throw new Error('Cette ligne a changé. Rechargez la grille.');
      const after = { ...entry, version: entry.version + 1 };
      await queueReferenceChange(user!.workspaceId, { scope: 'salary', patches: [{ id: entry.id, before: previous, after }] });
      return cached() ?? [after];
    },
    onSuccess: entries => { if (!remote) cache(entries); client.setQueryData(queryKey, entries); void client.invalidateQueries({queryKey:['salary-grid']}); }
  });
  const deletion = useMutation({
    onMutate: () => client.cancelQueries({ queryKey }),
    networkMode: 'always',
    mutationFn: async (entry: SalaryGridEntry) => {
      if (!can('settings.manage')) throw new Error('Suppression réservée aux administrateurs.');
      const entries = cached() ?? (remote ? [] : seed);
      const previous = entries.find(item => item.id === entry.id);
      if (!previous || previous.version !== entry.version) throw new Error('Cette ligne a changé. Rechargez la grille.');
      if (!remote) return entries.filter(item => item.id !== entry.id);
      await queueReferenceChange(user!.workspaceId, { scope: 'salary', patches: [{ id: entry.id, before: previous, after: null }] });
      return cached() ?? [];
    },
    onSuccess: entries => {
      if (!remote) cache(entries);
      client.setQueryData(queryKey, entries);
      void client.invalidateQueries({ queryKey: ['salary-grid'] });
    }
  });
  return { ...query, entries: query.data ?? [], save: mutation.mutateAsync, saving: mutation.isPending,
    remove: deletion.mutateAsync, deleting: deletion.isPending };

}
