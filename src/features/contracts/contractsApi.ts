import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import {
  ContractListParams,
  ContractStatus,
  CreateContractInput,
  UpdateContractInput,
  UpsertApplicantInput
} from "../../data/types";
import { ContractFormSchema } from "./contractSchema";

const provider = getDataProvider();

export function useContractsList(params: ContractListParams) {
  return useQuery({
    queryKey: ["contracts", params],
    queryFn: () => provider.contracts.list(params)
  });
}

export function useContract(contractId: string | undefined) {
  return useQuery({
    queryKey: ["contract", contractId],
    queryFn: () => (contractId ? provider.contracts.getById(contractId) : null),
    enabled: Boolean(contractId)
  });
}

export function useContractsByIds(ids: string[], workspaceId: string) {
  return useQuery({
    queryKey: ["contracts", "byIds", ids, workspaceId],
    queryFn: () => provider.contracts.getByIds(ids, workspaceId),
    enabled: ids.length > 0
  });
}

export function useCreateContract() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContractInput) => 
      provider.contracts.create({ ...input, createdBy: user?.id }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateContractInput) => provider.contracts.update(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.id] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useAssignContractsToDossier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      contractIds,
      dossierId
    }: {
      workspaceId: string;
      contractIds: string[];
      dossierId: string | null;
    }) => provider.contracts.assignToDossier(workspaceId, contractIds, dossierId),
    onSuccess: (_updatedCount, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
      variables.contractIds.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: ["contract", id] });
      });
    }
  });
}

export function useChangeContractsStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      contractIds,
      status
    }: {
      workspaceId: string;
      contractIds: string[];
      status: ContractStatus;
    }) => provider.contracts.updateStatus(workspaceId, contractIds, status),
    onSuccess: (_updatedCount, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
      variables.contractIds.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: ["contract", id] });
      });
    }
  });
}

export function useChangeContractsDuration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      contractIds,
      durationMonths
    }: {
      workspaceId: string;
      contractIds: string[];
      durationMonths: number;
    }) => provider.contracts.updateDuration(workspaceId, contractIds, durationMonths),
    onSuccess: (_updatedCount, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
      variables.contractIds.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: ["contract", id] });
      });
    }
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      provider.contracts.softDelete(id, workspaceId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.id] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function usePrintJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, ids }: { workspaceId: string; ids: string[] }) =>
      provider.printJobs.create(workspaceId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printJobs"] });
    }
  });
}

export function useApplicantUpsert() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: UpsertApplicantInput) => 
      provider.applicants.upsert({ ...input, createdBy: user?.id })
  });
}

export type ContractFormValues = ContractFormSchema;
