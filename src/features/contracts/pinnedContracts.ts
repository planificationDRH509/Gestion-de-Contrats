import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { useAuth } from "../auth/auth";

export const MAX_PINNED_CONTRACTS = 10;
const remote = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";

function storageKey(userId: string) {
  return `contribution_pinned_contracts:${userId}`;
}

export function readPinnedContracts(userId: string): string[] {
  if (!userId) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

function cachePinnedContracts(userId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    // The server remains authoritative when browser storage is unavailable.
  }
}

export function nextPinnedContracts(ids: string[], contractId: string): string[] {
  if (ids.includes(contractId)) return ids.filter(id => id !== contractId);
  if (ids.length >= MAX_PINNED_CONTRACTS) {
    throw new Error(`Vous pouvez épingler jusqu’à ${MAX_PINNED_CONTRACTS} contrats.`);
  }
  return [...ids, contractId];
}

export function usePinnedContracts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";
  const queryKey = ["pinned-contracts", userId] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async () => {
      const cached = readPinnedContracts(userId);
      if (!remote || !navigator.onLine) return cached;
      if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
      const { data, error } = await getSupabaseClient().rpc("read_pinned_contracts", {
        p_session_token: user.taskSessionToken
      });
      if (error) throw error;
      const ids = data ?? [];
      cachePinnedContracts(userId, ids);
      return ids;
    },
    initialData: () => readPinnedContracts(userId),
    initialDataUpdatedAt: 0,
    staleTime: 0,
    networkMode: "always",
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
    retry: false
  });
  const mutation = useMutation({
    networkMode: "always",
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
    },
    mutationFn: async (contractId: string) => {
      const current = queryClient.getQueryData<string[]>(queryKey) ?? readPinnedContracts(userId);
      const next = nextPinnedContracts(current, contractId);
      if (remote) {
        if (!navigator.onLine) throw new Error("Connectez-vous pour modifier les contrats épinglés.");
        if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
        const { data, error } = await getSupabaseClient().rpc("set_pinned_contract", {
          p_session_token: user.taskSessionToken,
          p_contract_id: contractId,
          p_pinned: next.includes(contractId)
        });
        if (error) throw error;
        return data ?? [];
      }
      return next;
    },
    onSuccess: ids => {
      cachePinnedContracts(userId, ids);
      queryClient.setQueryData(queryKey, ids);
    },
    onError: () => {
      if (remote && navigator.onLine) void queryClient.invalidateQueries({ queryKey });
    }
  });
  const forget = (contractId: string) => {
    const ids = (queryClient.getQueryData<string[]>(queryKey) ?? readPinnedContracts(userId))
      .filter(id => id !== contractId);
    cachePinnedContracts(userId, ids);
    queryClient.setQueryData(queryKey, ids);
  };
  return { ids: query.data ?? [], toggle: mutation.mutateAsync, forget, isPending: mutation.isPending };
}
