import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, label }: { workspaceId: string; label: string }) =>
      repo().addAddress(workspaceId, label, user?.id),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "addresses", workspaceId] });
    }
  });
}

export function useAddPosition() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, label, defaultSalary }: { workspaceId: string; label: string; defaultSalary: number }) =>
      repo().addPosition(workspaceId, label, defaultSalary, user?.id),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "positions", workspaceId] });
    }
  });
}

export function useAddInstitution() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, label, addressKeywords }: { workspaceId: string; label: string; addressKeywords: string[] }) =>
      repo().addInstitution(workspaceId, label, addressKeywords, user?.id),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "institutions", workspaceId] });
    }
  });
}

export function useUpdateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, prefix, labelFeminine }: { id: string; label: string; prefix?: string | null; labelFeminine?: string | null }) =>
      repo().updateAddress(id, label, prefix, labelFeminine),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "addresses"] });
    }
  });
}

export function useUpdatePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, defaultSalary, prefix, labelFeminine }: { id: string; label: string; defaultSalary: number; prefix?: string | null; labelFeminine?: string | null }) =>
      repo().updatePosition(id, label, defaultSalary, prefix, labelFeminine),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "positions"] });
    }
  });
}

export function useUpdateInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, addressKeywords, prefix, labelFeminine }: { id: string; label: string; addressKeywords: string[]; prefix?: string | null; labelFeminine?: string | null }) =>
      repo().updateInstitution(id, label, addressKeywords, prefix, labelFeminine),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", "institutions"] });
    }
  });
}
