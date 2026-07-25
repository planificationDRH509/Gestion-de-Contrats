import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { AppUser } from "../../data/types";
import { normalizeAppRole } from "./permissions";

type AppUserRow = {
  id: string;
  username: string;
  full_name: string;
  role?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AppUsersFetchResult = {
  users: AppUser[];
  hasRoleColumn: boolean;
};

export function isMissingRoleColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        /app_users\.role|column .*role.*does not exist|schema cache.*role/i.test(error.message ?? ""))
  );
}

function mapAppUser(item: AppUserRow): AppUser {
  return {
    id: item.id,
    username: item.username,
    fullName: item.full_name,
    role: normalizeAppRole(item.role, item.username),
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

export async function fetchAppUsers(): Promise<AppUsersFetchResult> {
  const supabase = getSupabaseClient();
  const withRole = await supabase
    .from("app_users")
    .select("id, username, full_name, role, created_at, updated_at")
    .order("full_name", { ascending: true });

  if (!withRole.error) {
    return {
      users: (withRole.data ?? []).map((item) => mapAppUser(item)),
      hasRoleColumn: true
    };
  }

  if (!isMissingRoleColumn(withRole.error)) {
    throw withRole.error;
  }

  // Keep names and usernames visible on installations that have not yet run
  // 013_app_user_roles.sql. Roles cannot be persisted until that migration is applied.
  const legacy = await supabase
    .from("app_users")
    .select("id, username, full_name, created_at, updated_at")
    .order("full_name", { ascending: true });

  if (legacy.error) throw legacy.error;
  return {
    users: (legacy.data ?? []).map((item) => mapAppUser(item)),
    hasRoleColumn: false
  };
}

export function useAppUsers() {
  return useQuery({
    queryKey: ["app_users"],
    queryFn: async () => {
      const result = await fetchAppUsers();
      return result.users;
    }
  });
}
