import { undoContractImport } from "./contractImportBatch";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import {
  Applicant,
  ContractListParams,
  ContractListResult,
  ContractStatus,
  CreateContractInput,
  UpdateContractInput,
  UpsertApplicantInput
} from "../../data/types";
import { ContractFormSchema } from "./contractSchema";
import { loadImportContracts, runContractImport, type ImportRunInput } from "./contractImportRun";
export type { ContractImportProgress } from "./contractImportRun";
import {
  readCachedContract,
  readCachedContracts,
  readCachedContractsByIds
} from "../../data/local/localContractRepository";
import { readCachedApplicants } from "../../data/local/localApplicantRepository";
import { flushLocalDbWrites } from "../../data/local/localDb";
import { getWorkspaceSyncMetadata, hasWorkspaceOfflineCache, upsertApplicantOffline } from "../../data/local/offlineStore";
import { getStoredFiscalYear } from "../settings/settingsApi";
import { identityDigits } from "../../data/contractIdentity";
import { getContractFiscalYear } from "../../lib/contractDateFilters";
import { listContractsPinnedFirst } from "./pinnedContractOrdering";

// ── NIF Lookup ────────────────────────────────────────────────────────────────

export interface NifIdentification {
  nif: string;
  nom: string;
  prenom: string;
  sexe: string | null;
  ninu: string | null;
  adresse: string;
  telephone?: string | null;
}

export interface NifContractMatch {
  id_contrat: string;
  annee_fiscale: string;
  createdAt?: string;
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
  const applicant = usesSupabase
    ? readCachedApplicants(workspaceId).find(person => identityDigits(person.nif || person.id) === identityDigits(nif)) ?? null
    : await provider.applicants.findByNifOrNinu(workspaceId, nif, null);
  // Contract checks never depend on the identification table being cached.
  const matches = usesSupabase
    ? readCachedContracts({ workspaceId, all: true, sort: "createdAt_desc" })
    : await provider.contracts.list({ workspaceId, query: nif, all: true, sort: "createdAt_desc" });
  const matchingContracts = matches.items.filter((contract) =>
    identityDigits(contract.nif || contract.applicantId) === identityDigits(nif));
  const contracts: NifContractMatch[] = matchingContracts.map((contract) => ({
    id_contrat: contract.id, annee_fiscale: getContractFiscalYear(contract), createdAt: contract.createdAt,
    titre: contract.position, lieu_affectation: contract.assignment, salaire: contract.salaryText,
    salaire_en_chiffre: contract.salaryNumber, duree_contrat: contract.durationMonths
  }));
  const cachedIdentity = matchingContracts[0];

  return {
    identification: applicant
      ? {
          nif: applicant.nif || applicant.id,
          nom: applicant.lastName,
          prenom: applicant.firstName,
          sexe: applicant.gender,
          ninu: applicant.ninu ?? null,
          adresse: applicant.address,
          telephone: applicant.phone ?? null,
        }
      : cachedIdentity ? {
          nif, nom: cachedIdentity.lastName, prenom: cachedIdentity.firstName,
          sexe: cachedIdentity.gender, ninu: cachedIdentity.ninu ?? null, adresse: cachedIdentity.address
        } : null,
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
    queryKey: ["nif-lookup", workspaceId, formattedNif],
    networkMode: "always",
    queryFn: () => lookupNif(formattedNif!, workspaceId),
    enabled: isComplete && !!workspaceId,
    staleTime: 0,
    retry: false,
  });
}

const provider = getDataProvider();
const usesSupabase = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";

export function useContractsList(
  params: ContractListParams,
  options: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: ["contracts", params],
    queryFn: () => listContractsPinnedFirst((listParams) => provider.contracts.list(listParams), params),
    placeholderData: params.pinnedIds?.length ? undefined : keepPreviousData,
    initialData: usesSupabase && !params.pinnedIds?.length
      ? () => (params.all
        ? Boolean(getWorkspaceSyncMetadata(params.workspaceId).lastFullSyncedAt)
        : hasWorkspaceOfflineCache(params.workspaceId)) ? readCachedContracts(params) : undefined
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    networkMode: "always",
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
    enabled: options.enabled ?? true,
  });
}

export function useContract(contractId: string | undefined) {
  return useQuery({
    queryKey: ["contract", contractId],
    networkMode: "always",
    queryFn: () => (contractId ? provider.contracts.getById(contractId) : null),
    enabled: Boolean(contractId),
    initialData: usesSupabase && contractId
      ? () => readCachedContract(contractId) ?? undefined
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
  });
}

export function useContractsByIds(ids: string[], workspaceId: string) {
  return useQuery({
    queryKey: ["contracts", "byIds", ids, workspaceId],
    networkMode: "always",
    queryFn: () => provider.contracts.getByIds(ids, workspaceId),
    enabled: ids.length > 0,
    initialData: usesSupabase
      ? () => hasWorkspaceOfflineCache(workspaceId)
        ? readCachedContractsByIds(ids, workspaceId)
        : undefined
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
  });
}

export function useCreateContract() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: CreateContractInput) =>
      provider.contracts.create({
        ...input,
        annee_fiscale: input.annee_fiscale ?? getStoredFiscalYear(),
        createdBy: user?.id
      }),
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
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
    networkMode: "always",
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
    }
  });
}

export function useAssignContractsToDossier() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
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
    networkMode: "always",
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
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
    networkMode: "always",
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
      variables.contractIds.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: ["contract", id] });
      });
    }
  });
}

export function useImportApplicantMatches(
  workspaceId: string,
  nifs: string[],
  ninus: string[],
  enabled: boolean
) {
  return useQuery<Applicant[]>({
    queryKey: ["contract-import", "identity-matches", workspaceId, nifs, ninus],
    networkMode: "always",
    queryFn: () => provider.applicants.findManyByNifOrNinu(workspaceId, nifs, ninus),
    enabled: enabled && Boolean(workspaceId) && (nifs.length > 0 || ninus.length > 0),
    staleTime: 30_000,
    retry: 1
  });
}

export function useImportContractHistory(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["contract-import", "history", workspaceId],
    networkMode: "always",
    queryFn: () => loadImportContracts(provider, workspaceId),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 0,
    retry: 1
  });
}

export function useImportContracts() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: ImportRunInput) => runContractImport(provider, input),
    onSettled: (_contracts, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dossiers", variables.workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["contract-import"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
      queryClient.invalidateQueries({ queryKey: ["identification"] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useUndoContractImport() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: ({ workspaceId, userId, batchId }: { workspaceId: string; userId: string; batchId: string }) => undoContractImport(provider, workspaceId, userId, batchId),
    onSettled: () => {
      for (const key of ["contracts", "contract", "contract-import", "dossiers", "contract-lists", "nif-lookup", "identification"]) queryClient.invalidateQueries({ queryKey: [key] });
    }
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.id] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function usePermanentlyDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      provider.contracts.permanentlyDelete(id, workspaceId),
    onMutate: () => queryClient.cancelQueries({ queryKey: ["contracts"] }),
    onSuccess: (_data, { id, workspaceId }) => {
      queryClient.setQueriesData<ContractListResult>({ queryKey: ["contracts"] }, previous => {
        if (!previous?.items) return previous;
        const items = previous.items.filter(contract => contract.id !== id || contract.workspaceId !== workspaceId);
        return { ...previous, items, total: previous.total - (previous.items.length - items.length) };
      });
      queryClient.removeQueries({ queryKey: ["contract", id] });
      for (const key of ["contracts", "contract-lists", "pinned-contracts", "nif-lookup", "contract-import"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      queryClient.invalidateQueries({ queryKey: ["dossiers", "metrics", workspaceId] });
    }
  });
}

export function usePrintJob() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: ({ workspaceId, ids }: { workspaceId: string; ids: string[] }) =>
      provider.printJobs.create(workspaceId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printJobs"] });
    }
  });
}

export function useApplicantUpsert() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ queueLocally, ...input }: UpsertApplicantInput & { queueLocally?: boolean }) => {
      const payload = { ...input, createdBy: user?.id };
      if (queueLocally && usesSupabase) {
        const applicant = upsertApplicantOffline(payload);
        await flushLocalDbWrites();
        return applicant;
      }
      return provider.applicants.upsert(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-import", "identity-matches"] });
      queryClient.invalidateQueries({ queryKey: ["identification"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
    }
  });
}

export type ContractFormValues = ContractFormSchema;
