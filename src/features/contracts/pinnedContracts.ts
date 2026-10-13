import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { useAuth } from "../auth/auth";

import { readPinnedContracts, cachePinnedContracts, nextPinnedContracts } from "./pinnedContractsCache";
import { getPendingOutbox } from "../../data/local/offlineStore";
import { queueOutbox } from "../../data/local/localOutbox";
import { flushLocalDbWrites } from "../../data/local/localDb";
export { readPinnedContracts, nextPinnedContracts, MAX_PINNED_CONTRACTS } from "./pinnedContractsCache";

const remote = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";

function overlayPendingPins(userId: string, ids: string[]) {
  const next = new Set(ids);
  for (const item of getPendingOutbox()) {
    if (item.type !== "pin.set" || item.payload.userId !== userId) continue;
    const id = String(item.payload.contractId);
    if (item.payload.pinned) next.add(id); else next.delete(id);
  }
  return [...next];
}

export function usePinnedContracts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";
  const queryKey = ["pinned-contracts", userId] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const cached = overlayPendingPins(userId, readPinnedContracts(userId));
      if (!remote || !navigator.onLine) return cached;
      if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
      const { data, error } = await getSupabaseClient().rpc("read_pinned_contracts", {
        p_session_token: user.taskSessionToken
      });
      if (error) throw error;
      if (signal.aborted) return overlayPendingPins(userId, readPinnedContracts(userId));
      const ids = overlayPendingPins(userId, data ?? []);
      cachePinnedContracts(userId, ids);
      return ids;
    },
    initialData: () => overlayPendingPins(userId, readPinnedContracts(userId)),
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
      const current = overlayPendingPins(userId, readPinnedContracts(userId));
      const next = nextPinnedContracts(current, contractId);
      if (remote) {
        if (!user) throw new Error("Session utilisateur indisponible.");
        queueOutbox(user.workspaceId, "pin.set", { contractId, pinned: next.includes(contractId), userId });
        await flushLocalDbWrites();
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
