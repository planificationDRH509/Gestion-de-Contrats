import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import { Tag } from "../../data/types";
import { readCachedTags } from "../../data/local/localTagRepository";
import { hasWorkspaceOfflineCache } from "../../data/local/offlineStore";

export type { Tag };

const provider = getDataProvider();
const usesSupabase = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";

export function useTags(workspaceId: string) {
  return useQuery({
    queryKey: ["tags", workspaceId],
    queryFn: () => provider.tags.list(workspaceId),
    enabled: Boolean(workspaceId),
    initialData: usesSupabase
      ? () => hasWorkspaceOfflineCache(workspaceId) ? readCachedTags(workspaceId) : undefined
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
  });
}

export function useCreateTag() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, name, color }: { workspaceId: string; name: string; color?: string }) =>
      provider.tags.create({ workspaceId, name, color, createdBy: user?.id }),
    onSuccess: (tag) => {
      queryClient.invalidateQueries({ queryKey: ["tags", tag.workspaceId] });
    },
  });
}

export function useAssignTagToContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      contractId,
      tagId
    }: {
      workspaceId: string;
      contractId: string;
      tagId: string;
    }) => provider.tags.assignToContract(workspaceId, contractId, tagId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.contractId] });
      queryClient.invalidateQueries({ queryKey: ["tags", variables.workspaceId] });
    },
  });
}

export function useRemoveTagFromContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      contractId,
      tagId
    }: {
      workspaceId: string;
      contractId: string;
      tagId: string;
    }) => provider.tags.removeFromContract(workspaceId, contractId, tagId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.contractId] });
      queryClient.invalidateQueries({ queryKey: ["tags", variables.workspaceId] });
    },
  });
}
