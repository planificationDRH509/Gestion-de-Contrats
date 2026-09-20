import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { sqliteApiRequest } from "../../data/local/sqliteApiClient";
import { syncSupabaseOutbox } from "../../data/supabase/supabaseProvider";
import { getPendingOutbox } from "../../data/local/offlineStore";
import { useAuth } from "../auth/auth";
import type { ContractList, ListOperation } from "./listModel";

const remote = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";
export function useContractLists() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contract-lists", user?.workspaceId, user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<ContractList[]> => {
      if (!user) return [];
      if (!remote) return sqliteApiRequest(`/lists?workspaceId=${encodeURIComponent(user.workspaceId)}`);
      if (!user.taskSessionToken) throw new Error("TASK_SESSION_REQUIRED");
      const { data, error } = await getSupabaseClient().rpc("read_contract_lists", {
        p_session_token: user.taskSessionToken, p_workspace_id: user.workspaceId
      });
      if (error) throw error;
      return data as unknown as ContractList[];
    },
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
      if (remote && !navigator.onLine) throw new Error("Reconnectez-vous pour modifier les listes et vérifier leur état actuel.");
      if (!remote) return sqliteApiRequest("/lists", { method: "POST", body: { ...operation, workspaceId: user.workspaceId } });
      if (!user.taskSessionToken) throw new Error("TASK_SESSION_REQUIRED");
      await syncSupabaseOutbox();
      if (getPendingOutbox().some(item => item.workspaceId === user.workspaceId && /^(contract|applicant)\./.test(item.type))) {
        throw new Error("Des modifications de contrats restent à synchroniser. Résolvez la synchronisation avant de modifier les listes.");
      }
      const { data, error } = await getSupabaseClient().rpc("mutate_contract_list", {
        p_session_token: user.taskSessionToken, p_workspace_id: user.workspaceId, p_operation: operation
      });
      if (error) throw error;
      return data;
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
