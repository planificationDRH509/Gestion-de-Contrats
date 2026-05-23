import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import { Tag } from "../../data/types";

export type { Tag };

const provider = getDataProvider();

export function useTags(workspaceId: string) {
  return useQuery({
    queryKey: ["tags", workspaceId],
    queryFn: () => provider.tags.list(workspaceId),
    enabled: Boolean(workspaceId),
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
