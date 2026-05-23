import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return data as Tag[];
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const supabase = getSupabaseClient();
      // Generate a random nice color if not provided
      const finalColor = color || `hsl(${Math.random() * 360}, 70%, 50%)`;
      
      const { data, error } = await supabase
        .from("tags")
        .insert({ name, color: finalColor })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as Tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useAssignTagToContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, tagId }: { contractId: string; tagId: string }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("contract_tags")
        .insert({ contract_id: contractId, tag_id: tagId });

      if (error) throw new Error(error.message);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.contractId] });
    },
  });
}

export function useRemoveTagFromContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, tagId }: { contractId: string; tagId: string }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("contract_tags")
        .delete()
        .eq("contract_id", contractId)
        .eq("tag_id", tagId);

      if (error) throw new Error(error.message);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract", variables.contractId] });
    },
  });
}
