import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import {
  ContractListParams,
  ContractListResult,
  ContractStatus,
  CreateContractInput,
  UpdateContractInput,
  UpsertApplicantInput
} from "../../data/types";
import { ContractFormSchema } from "./contractSchema";
import type { ContractImportDraft } from "./contractImport";

// ── NIF Lookup ────────────────────────────────────────────────────────────────

export interface NifIdentification {
  nif: string;
  nom: string;
  prenom: string;
  sexe: string | null;
  ninu: string | null;
  adresse: string;
}

export interface NifContractMatch {
  id_contrat: string;
  annee_fiscale: string;
  titre: string;
  lieu_affectation: string;
  salaire: string;
  salaire_en_chiffre: number;
  duree_contrat: number;
}

export interface NifLookupResult {
  identification: NifIdentification | null;
  /** All existing contracts for this NIF (excluding deleted) */
  contracts: NifContractMatch[];
}

export async function lookupNif(rawNif: string, workspaceId: string): Promise<NifLookupResult> {
  const nif = rawNif.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d)/, "$1-$2-$3-$4");
  const applicant = await provider.applicants.findByNifOrNinu(workspaceId, nif, null);
  let contracts: NifContractMatch[] = [];
  if (applicant) {
    const matches = await provider.contracts.list({
      workspaceId,
      query: nif,
      page: 1,
      pageSize: 250,
      sort: "createdAt_desc"
    });
    contracts = matches.items
      .filter((contract) => contract.nif === nif || contract.applicantId === nif)
      .map((contract) => ({
        id_contrat: contract.id,
        annee_fiscale: "",
        titre: contract.position,
        lieu_affectation: contract.assignment,
        salaire: contract.salaryText,
        salaire_en_chiffre: contract.salaryNumber,
        duree_contrat: contract.durationMonths
      }));
  }

  return {
    identification: applicant
      ? {
          nif: applicant.nif || applicant.id,
          nom: applicant.lastName,
          prenom: applicant.firstName,
          sexe: applicant.gender,
          ninu: applicant.ninu ?? null,
          adresse: applicant.address,
        }
      : null,
    contracts,
  };
}

export function useNifLookupQuery(rawNif: string | null, workspaceId: string) {
  // Format NIF for lookup (needs 10 digits to be considered complete)
  const digits = (rawNif ?? "").replace(/\D/g, "");
  const isComplete = digits.length === 10;
  const formattedNif = isComplete
    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`
    : null;

  return useQuery({
    queryKey: ["nif-lookup", formattedNif],
    queryFn: () => lookupNif(formattedNif!, workspaceId),
    enabled: isComplete && !!workspaceId,
    staleTime: 30_000,
    retry: false,
  });
}

const provider = getDataProvider();

export function useContractsList(params: ContractListParams) {
  return useQuery({
    queryKey: ["contracts", params],
    queryFn: () => provider.contracts.list(params),
    placeholderData: keepPreviousData,
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
    onMutate: async (newContract) => {
      await queryClient.cancelQueries({ queryKey: ["contracts"] });
      const previousData = queryClient.getQueryData<ContractListResult>(["contracts"]);

      const tempId = `temp-${Date.now()}`;
      const optimisticContract = {
        ...newContract,
        id: tempId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;

      if (previousData) {
        queryClient.setQueryData<ContractListResult>(["contracts"], {
          ...previousData,
          items: [optimisticContract, ...previousData.items],
          total: previousData.total + 1
        });
      }

      return { previousData };
    },
    onError: (_err, _newContract, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["contracts"], context.previousData);
      }
    },
    onSettled: (_data, _error, variables) => {
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
    onMutate: async (updatedContract) => {
      await queryClient.cancelQueries({ queryKey: ["contracts"] });
      await queryClient.cancelQueries({ queryKey: ["contract", updatedContract.id] });

      const previousList = queryClient.getQueryData<ContractListResult>(["contracts"]);
      const previousDetail = queryClient.getQueryData(["contract", updatedContract.id]);

      if (previousList) {
        queryClient.setQueryData<ContractListResult>(["contracts"], {
          ...previousList,
          items: previousList.items.map(c => 
            c.id === updatedContract.id ? { ...c, ...updatedContract } : c
          )
        });
      }

      if (previousDetail) {
        queryClient.setQueryData(["contract", updatedContract.id], {
          ...(previousDetail as any),
          ...updatedContract
        });
      }

      return { previousList, previousDetail };
    },
    onError: (_err, updatedContract, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(["contracts"], context.previousList);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(["contract", updatedContract.id], context.previousDetail);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.id] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useUpdateContractComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workspaceId, commentaire }: { id: string; workspaceId: string; commentaire: string | null }) =>
      provider.contracts.update({ id, workspaceId, commentaire }),
    onMutate: async (newComment) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["contracts"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<ContractListResult>(["contracts"]);

      // Optimistically update to the new value
      if (previousData) {
        queryClient.setQueryData<ContractListResult>(["contracts"], {
          ...previousData,
          items: previousData.items.map(c => 
            c.id === newComment.id ? { ...c, commentaire: newComment.commentaire } : c
          )
        });
      }

      return { previousData };
    },
    onError: (_err, _newComment, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(["contracts"], context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to keep server and client in sync
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
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

export function useImportContracts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      dossierId,
      responsibleUserId,
      rows
    }: {
      workspaceId: string;
      dossierId: string | null;
      responsibleUserId: string;
      rows: ContractImportDraft[];
    }) => {
      const applicantRows = new Map<string, ContractImportDraft>();
      for (const row of rows) {
        applicantRows.set(row.nif, row);
      }

      for (const row of applicantRows.values()) {
        await provider.applicants.upsert({
          workspaceId,
          gender: row.gender,
          firstName: row.firstName,
          lastName: row.lastName,
          nif: row.nif,
          ninu: row.ninu,
          address: row.address,
          createdBy: responsibleUserId
        });
      }
      const createdContracts = await provider.contracts.createMany(
        rows.map((row) => ({
          workspaceId,
          applicantId: row.nif,
          dossierId,
          status: "saisie",
          gender: row.gender,
          firstName: row.firstName,
          lastName: row.lastName,
          nif: row.nif,
          ninu: row.ninu,
          address: row.address,
          position: row.position,
          assignment: row.assignment,
          salaryNumber: row.salaryNumber,
          salaryText: row.salaryText,
          durationMonths: row.durationMonths,
          commentaire: row.commentaire,
          createdBy: responsibleUserId
        }))
      );
      return createdContracts;
    },
    onSuccess: (_contracts, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      provider.contracts.softDelete(id, workspaceId),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["contracts"] });
      
      const previousData = queryClient.getQueryData<ContractListResult>(["contracts"]);

      if (previousData) {
        queryClient.setQueryData<ContractListResult>(["contracts"], {
          ...previousData,
          items: previousData.items.filter(c => c.id !== id),
          total: previousData.total - 1
        });
      }

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["contracts"], context.previousData);
      }
    },
    onSettled: (_data, _error, variables) => {
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
