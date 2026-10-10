import { getSupabaseClient } from "../../data/supabase/supabaseClient";

/** Authentication failures are data, so PostgreSQL can commit the attempt counter. */
export async function authenticatePassword(userId: string, password: string) {
  const result = await getSupabaseClient().rpc("authenticate_app_user", {
    p_user_id: userId, p_password: password
  });
  const value = result.data as { taskSessionToken?: string; error?: string; failedAttempts?: number } | null;
  return {
    data: value?.taskSessionToken ?? null,
    failedAttempts: value?.failedAttempts ?? 0,
    error: result.error ?? (value?.error ? { message: value.error } : null)
  };
}
