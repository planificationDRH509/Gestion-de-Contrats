import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { AppUser } from "../../data/types";

export function useAppUsers() {
  return useQuery({
    queryKey: ["app_users"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .order("full_name", { ascending: true });

      if (error) throw error;
      
      return (data || []).map(u => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        workspaces: u.workspaces || [],
        createdAt: u.created_at,
        updatedAt: u.updated_at
      })) as AppUser[];
    }
  });
}
