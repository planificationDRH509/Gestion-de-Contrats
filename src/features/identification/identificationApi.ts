import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { Gender } from "../../data/types";

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
  nif: string; // PK – used to locate the row
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
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("identification")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as IdentificationRow[];
    },
    enabled: !!workspaceId,
  });
}

export function useCreateIdentification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIdentificationInput) => {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("identification")
        .insert({
          nif: input.nif,
          nom: input.nom,
          prenom: input.prenom,
          sexe: input.sexe,
          ninu: input.ninu,
          adresse: input.adresse,
          workspace_id: input.workspace_id,
          created_by: input.created_by ?? null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        // Duplicate NIF
        if (error.code === "23505" && error.message.includes("identification_pkey")) {
          throw new Error("Ce NIF existe déjà dans la base d'identification.");
        }
        // Duplicate NINU
        if (error.code === "23505" && error.message.includes("ninu")) {
          throw new Error("Ce NINU est déjà attribué à une autre personne.");
        }
        throw new Error(error.message);
      }
      return data as unknown as IdentificationRow;
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
      const supabase = getSupabaseClient();
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.nom !== undefined) updates.nom = input.nom;
      if (input.prenom !== undefined) updates.prenom = input.prenom;
      if (input.sexe !== undefined) updates.sexe = input.sexe;
      if (input.ninu !== undefined) updates.ninu = input.ninu;
      if (input.adresse !== undefined) updates.adresse = input.adresse;

      const { data, error } = await supabase
        .from("identification")
        .update(updates)
        .eq("nif", input.nif)
        .select()
        .single();

      if (error) {
        if (error.code === "23505" && error.message.includes("ninu")) {
          throw new Error("Ce NINU est déjà attribué à une autre personne.");
        }
        throw new Error(error.message);
      }
      return data as unknown as IdentificationRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identification"] });
    },
  });
}

export function useDeleteIdentification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nif: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("identification")
        .update({ deleted_at: new Date().toISOString() })
        .eq("nif", nif);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identification"] });
    },
  });
}

/**
 * Check if a NIF already exists in the identification table.
 * Returns true if the NIF is already taken.
 */
export async function checkNifExists(nif: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("identification")
    .select("nif")
    .eq("nif", nif)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}
