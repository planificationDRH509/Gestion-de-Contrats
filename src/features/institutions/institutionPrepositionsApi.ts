import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth';
import { getSupabaseClient } from '../../data/supabase/supabaseClient';
import type { Json } from '../../data/supabase/database.types';
import { cacheInstitutionPrepositions, readInstitutionPrepositions, validateInstitutionPreposition, type InstitutionPrepositionRule } from './institutionPrepositions';

const remote = (import.meta.env.VITE_DATA_PROVIDER ?? 'local') === 'supabase';
export function useInstitutionPrepositions() {
  const {user,can} = useAuth();
  const client = useQueryClient();
  const queryKey = ['institution-prepositions', user?.id ?? ''];
  const query = useQuery({
    queryKey, enabled:Boolean(user), initialData:readInstitutionPrepositions, initialDataUpdatedAt:0,
    staleTime:30_000, refetchOnReconnect:'always' as const, refetchOnWindowFocus:true,
    queryFn:async () => {
      if (!remote) return readInstitutionPrepositions();
      if (!user?.taskSessionToken) throw new Error('Session utilisateur indisponible.');
      const {data,error} = await getSupabaseClient().rpc('read_institution_prepositions', {p_session_token:user.taskSessionToken});
      if (error) throw error;
      const rules = data as unknown as InstitutionPrepositionRule[];
      rules.forEach(validateInstitutionPreposition);
      cacheInstitutionPrepositions(rules);
      return rules;
    }
  });
  const mutation = useMutation({
    networkMode:'always',
    mutationFn:async (changes:InstitutionPrepositionRule[]) => {
      if (!can('settings.manage')) throw new Error('Modification réservée aux administrateurs.');
      changes.forEach(validateInstitutionPreposition);
      if (!remote) {
        const current = readInstitutionPrepositions();
        return current.map(rule => {
          const change = changes.find(r => r.family === rule.family);
          if (!change) return rule;
          if (change.version !== rule.version) throw new Error('Ces prépositions ont changé. Rechargez la liste.');
          return {...change,prefix:change.prefix.trim(),version:rule.version+1};
        });
      }
      if (!navigator.onLine) throw new Error('Connectez-vous pour modifier les prépositions.');
      if (!user?.taskSessionToken) throw new Error('Session utilisateur indisponible.');
      const {data,error} = await getSupabaseClient().rpc('save_institution_prepositions', {
        p_session_token:user.taskSessionToken,p_rules:changes as unknown as Json
      });
      if (error) throw error;
      return data as unknown as InstitutionPrepositionRule[];
    },
    onSuccess:rules => {
      cacheInstitutionPrepositions(rules);
      client.setQueryData(queryKey,rules);
      void client.invalidateQueries({queryKey:['institution-prepositions']});
    }
  });
  return {...query,rules:query.data,save:mutation.mutateAsync,saving:mutation.isPending};
}
