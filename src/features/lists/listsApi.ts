import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { sqliteApiRequest } from "../../data/local/sqliteApiClient";
import { syncSupabaseOutbox } from "../../data/supabase/supabaseProvider";
import { isOfflineFailure } from "../../data/local/offlineStore";
import { cacheContractLists, hasCachedContractLists, mutateContractListOffline, readCachedContractLists } from "../../data/local/localListRepository";
import { useAuth } from "../auth/auth";
import type { ContractList, ListOperation } from "./listModel";

const remote = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";
export function useContractLists() {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ["contract-lists", user?.workspaceId, user?.id] as const;
  return useQuery({
    queryKey,
    enabled: Boolean(user),
    queryFn: async (): Promise<ContractList[]> => {
      if (!user) return [];
      if (!remote) return sqliteApiRequest(`/lists?workspaceId=${encodeURIComponent(user.workspaceId)}`);
      if (!hasCachedContractLists(user.workspaceId)) {
        const previous = client.getQueryData<ContractList[]>(queryKey);
        if (previous) cacheContractLists(user.workspaceId, previous);
      }
      const cached = () => readCachedContractLists(user.workspaceId);
      if (!navigator.onLine) return cached();
      if (!user.taskSessionToken) throw new Error("TASK_SESSION_REQUIRED");
      try {
        await syncSupabaseOutbox();
        const { data, error } = await getSupabaseClient().rpc("read_contract_lists", {
          p_session_token: user.taskSessionToken, p_workspace_id: user.workspaceId
        });
        if (error) throw error;
        cacheContractLists(user.workspaceId, data as unknown as ContractList[]);
        return cached();
      } catch (error) {
        if (isOfflineFailure(error)) return cached();
        throw error;
      }
    },
    networkMode: "always",
    initialData: remote && user && hasCachedContractLists(user.workspaceId)
      ? () => readCachedContractLists(user.workspaceId) : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true,
    refetchOnReconnect: "always", refetchInterval: 30_000, retry: false
  });
}
export function useListOperation() {
  const { user, can } = useAuth();
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async (operation: ListOperation): Promise<string | null> => {
      if (!user || !can("contracts.edit")) throw new Error("Vous n’avez pas le droit de modifier les listes.");
      if (!remote) return sqliteApiRequest("/lists", { method: "POST", body: { ...operation, workspaceId: user.workspaceId } });
      return mutateContractListOffline(user, operation);
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["contract-lists"] }),
        client.invalidateQueries({ queryKey: ["contracts"] }),
        client.invalidateQueries({ queryKey: ["contract"] })
      ]);
    }
  });
}
