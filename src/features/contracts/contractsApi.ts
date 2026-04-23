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
import { getSupabaseClient } from "../../data/supabase/supabaseClient";

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
  const supabase = getSupabaseClient();
  const nif = rawNif.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d)/, "$1-$2-$3-$4");

  // Query identification table
  const { data: idData, error: idError } = await supabase
    .from("identification")
    .select("nif, nom, prenom, sexe, ninu, adresse")
    .eq("nif", nif)
    .maybeSingle();

  if (idError) throw new Error(idError.message);

  // Query contrat table (only if identification exists)
  let contracts: NifContractMatch[] = [];
  if (idData) {
    const { data: contractData, error: contractError } = await supabase
      .from("contrat")
      .select("id_contrat, annee_fiscale, titre, lieu_affectation, salaire, salaire_en_chiffre, duree_contrat")
      .eq("nif", nif)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (contractError) throw new Error(contractError.message);
    contracts = (contractData ?? []) as unknown as NifContractMatch[];
  }

  return {
    identification: idData
      ? {
          nif: idData.nif,
          nom: idData.nom,
          prenom: idData.prenom,
          sexe: idData.sexe ?? null,
          ninu: idData.ninu ?? null,
          adresse: idData.adresse,
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
