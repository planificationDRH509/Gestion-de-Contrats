import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import {
  Applicant,
  Contract,
  ContractListParams,
  ContractListResult,
  ContractStatus,
  CreateContractInput,
  UpdateContractInput,
  UpsertApplicantInput
} from "../../data/types";
import { ContractFormSchema } from "./contractSchema";
import {
  getContractImportIdentityIssues,
  type ContractImportDraft
} from "./contractImport";
import {
  readCachedContract,
  readCachedContracts,
  readCachedContractsByIds
} from "../../data/local/localContractRepository";
import { getWorkspaceSyncMetadata, hasWorkspaceOfflineCache } from "../../data/local/offlineStore";
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
  const applicant = await provider.applicants.findByNifOrNinu(workspaceId, nif, null);
  // Contract checks never depend on the identification table being cached.
  const matches = await provider.contracts.list({ workspaceId, query: nif, all: true, sort: "createdAt_desc" });
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

export type ContractImportProgress = {
  phase: "applicants" | "contracts";
  completed: number;
  total: number;
};

export function useImportApplicantMatches(
  workspaceId: string,
  nifs: string[],
  ninus: string[],
  enabled: boolean
) {
  return useQuery<Applicant[]>({
    queryKey: ["contract-import", "identity-matches", workspaceId, nifs, ninus],
    queryFn: () => provider.applicants.findManyByNifOrNinu(workspaceId, nifs, ninus),
    enabled: enabled && Boolean(workspaceId) && (nifs.length > 0 || ninus.length > 0),
    staleTime: 30_000,
    retry: 1
  });
}

const IMPORT_BATCH_SIZE = 200;

function batchesOf<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function useImportContracts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      dossierId,
      responsibleUserId,
      fiscalYear,
      rows,
      onProgress
    }: {
      workspaceId: string;
      dossierId: string | null;
      responsibleUserId: string;
      fiscalYear: string;
      rows: ContractImportDraft[];
      onProgress?: (progress: ContractImportProgress) => void;
    }) => {
      const importedNifs = Array.from(new Set(rows.map((row) => row.nif)));
      const importedNinus = Array.from(
        new Set(rows.map((row) => row.ninu).filter((value): value is string => Boolean(value)))
      );
      const existingApplicants = await provider.applicants.findManyByNifOrNinu(
        workspaceId,
        importedNifs,
        importedNinus
      );
      const identityIssues = getContractImportIdentityIssues(rows, existingApplicants);
      const conflicts = identityIssues
        .map((issue, index) => ({ index, errors: issue.errors }))
        .filter((issue) => issue.errors.length > 0);
      if (conflicts.length > 0) {
        const firstConflict = conflicts[0];
        throw new Error(
          `Conflit NIF/NINU sur ${conflicts.length} ligne(s). Ligne ${firstConflict.index + 1} de la sélection : ${firstConflict.errors.join(" ")}`
        );
      }

      const existingByNif = new Map(
        existingApplicants.map((applicant) => [
          (applicant.nif || applicant.id).replace(/\D/g, ""),
          applicant
        ])
      );
      const applicantInputsByNif = new Map<string, UpsertApplicantInput>();
      for (const row of rows) {
        const nifKey = row.nif.replace(/\D/g, "");
        const existing = existingByNif.get(nifKey);
        if (!existing) {
          applicantInputsByNif.set(nifKey, {
            workspaceId,
            gender: row.gender,
            firstName: row.firstName,
            lastName: row.lastName,
            nif: row.nif,
            ninu: row.ninu,
            phone: row.phone,
            address: row.address,
            createdBy: responsibleUserId
          });
        } else if (
          (!existing.ninu && row.ninu) ||
          (!existing.phone && row.phone) ||
          !existing.address
        ) {
          applicantInputsByNif.set(nifKey, {
            id: existing.id,
            workspaceId,
            gender: existing.gender,
            firstName: existing.firstName,
            lastName: existing.lastName,
            nif: existing.nif || existing.id,
            ninu: existing.ninu || row.ninu,
            phone: existing.phone || row.phone,
            address: existing.address || row.address,
            createdBy: existing.createdBy
          });
        }
      }

      const applicantInputs = Array.from(applicantInputsByNif.values());
      let preparedApplicants = 0;
      onProgress?.({ phase: "applicants", completed: 0, total: applicantInputs.length });
      for (const batch of batchesOf(applicantInputs, IMPORT_BATCH_SIZE)) {
        await provider.applicants.upsertMany(batch);
        preparedApplicants += batch.length;
        onProgress?.({
          phase: "applicants",
          completed: preparedApplicants,
          total: applicantInputs.length
        });
      }

      const contractInputs: CreateContractInput[] = rows.map((row) => ({
        workspaceId,
        annee_fiscale: fiscalYear,
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
      }));
      const createdContracts: Contract[] = [];
      onProgress?.({ phase: "contracts", completed: 0, total: contractInputs.length });
      for (const batch of batchesOf(contractInputs, IMPORT_BATCH_SIZE)) {
        try {
          createdContracts.push(...(await provider.contracts.createMany(batch)));
        } catch (error) {
          const detail = error instanceof Error ? ` ${error.message}` : "";
          throw new Error(
            `Import interrompu après ${createdContracts.length} contrat(s) enregistré(s).${detail}`
          );
        }
        onProgress?.({
          phase: "contracts",
          completed: createdContracts.length,
          total: contractInputs.length
        });
      }
      return createdContracts;
    },
    onSettled: (_contracts, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
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
      queryClient.invalidateQueries({ queryKey: ["contract-lists"] });
      queryClient.invalidateQueries({ queryKey: ["nif-lookup"] });
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
