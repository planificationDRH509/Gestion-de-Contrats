import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Applicant, Gender } from "../../data/types";
import { getDataProvider } from "../../data/dataProvider";
import { readCachedApplicants } from "../../data/local/localApplicantRepository";
import { hasWorkspaceOfflineCache } from "../../data/local/offlineStore";

const provider = getDataProvider();
const usesSupabase = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";

function mapApplicant(applicant: Applicant): IdentificationRow {
  return {
    nif: applicant.nif || applicant.id,
    nom: applicant.lastName,
    prenom: applicant.firstName,
    sexe: applicant.gender,
    ninu: applicant.ninu ?? null,
    adresse: applicant.address,
    workspace_id: applicant.workspaceId,
    created_at: applicant.createdAt,
    updated_at: applicant.updatedAt ?? null,
    deleted_at: applicant.deletedAt ?? null,
    created_by: applicant.createdBy ?? null
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IdentificationRow {
  nif: string;
  nom: string;
  prenom: string;
  sexe: string | null;
  ninu: string | null;
  adresse: string;
  workspace_id: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  created_by: string | null;
}

export interface CreateIdentificationInput {
  nif: string;
  nom: string;
  prenom: string;
  sexe: Gender;
  ninu: string | null;
  adresse: string;
  workspace_id: string;
  created_by?: string | null;
}

export interface UpdateIdentificationInput {
  oldNif: string; // Used to locate the row
  workspaceId: string;
  nif?: string;   // New NIF value
  nom?: string;
  prenom?: string;
  sexe?: Gender;
  ninu?: string | null;
  adresse?: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useIdentificationList(workspaceId: string) {
  return useQuery<IdentificationRow[]>({
    queryKey: ["identification", workspaceId],
    queryFn: async () => (await provider.applicants.list(workspaceId)).map(mapApplicant),
    enabled: !!workspaceId,
    initialData: usesSupabase
      ? () => hasWorkspaceOfflineCache(workspaceId)
        ? readCachedApplicants(workspaceId).map(mapApplicant)
        : undefined
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
  });
}

export function useCreateIdentification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIdentificationInput) => {
      const existing = await provider.applicants.findByNifOrNinu(
        input.workspace_id,
        input.nif,
        input.ninu
      );
      if (existing) {
        throw new Error("Ce NIF ou ce NINU existe déjà dans la base d'identification.");
      }
      return mapApplicant(await provider.applicants.upsert({
        workspaceId: input.workspace_id,
        gender: input.sexe,
        firstName: input.prenom,
        lastName: input.nom,
        nif: input.nif,
        ninu: input.ninu,
        address: input.adresse,
        createdBy: input.created_by ?? null
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identification"] });
    },
  });
}

export function useUpdateIdentification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateIdentificationInput) => {
      const current = await provider.applicants.getById(input.oldNif);
      if (!current) throw new Error("Fiche d'identification introuvable.");
      return mapApplicant(await provider.applicants.upsert({
        id: input.oldNif,
        workspaceId: input.workspaceId,
        gender: input.sexe ?? current.gender,
        firstName: input.prenom ?? current.firstName,
        lastName: input.nom ?? current.lastName,
        nif: input.nif ?? current.nif ?? current.id,
        ninu: input.ninu !== undefined ? input.ninu : current.ninu,
        address: input.adresse ?? current.address,
        createdBy: current.createdBy
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identification"] });
    },
  });
}

export function useDeleteIdentification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nif, workspaceId }: { nif: string; workspaceId: string }) =>
      provider.applicants.softDelete(nif, workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identification"] });
    },
  });
}

/**
 * Check if a NIF already exists in the identification table.
 * Returns true if the NIF is already taken.
 */
export async function checkNifExists(nif: string, workspaceId: string): Promise<boolean> {
  return (await provider.applicants.findByNifOrNinu(workspaceId, nif, null)) !== null;
}
