import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDataProvider } from "../../data/dataProvider";

const repo = () => getDataProvider().suggestions;

export function useAddresses(workspaceId: string) {
  return useQuery({
    queryKey: ["suggestions", "addresses", workspaceId],
    queryFn: () => repo().getAddresses(workspaceId),
    enabled: !!workspaceId
  });
}

export function usePositions(workspaceId: string) {
  return useQuery({
    queryKey: ["suggestions", "positions", workspaceId],
    queryFn: () => repo().getPositions(workspaceId),
    enabled: !!workspaceId
  });
}

export function useInstitutions(workspaceId: string) {
  return useQuery({
    queryKey: ["suggestions", "institutions", workspaceId],
    queryFn: () => repo().getInstitutions(workspaceId),
    enabled: !!workspaceId
  });
}

export function useAddAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, label }: { workspaceId: string; label: string }) =>
      repo().addAddress(workspaceId, label),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "addresses", workspaceId] });
    }
  });
}

export function useAddPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, label, defaultSalary }: { workspaceId: string; label: string; defaultSalary: number }) =>
      repo().addPosition(workspaceId, label, defaultSalary),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "positions", workspaceId] });
    }
  });
}

export function useAddInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, label, addressKeywords }: { workspaceId: string; label: string; addressKeywords: string[] }) =>
      repo().addInstitution(workspaceId, label, addressKeywords),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "institutions", workspaceId] });
    }
  });
}
