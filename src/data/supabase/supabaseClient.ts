import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase non configuré. Définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
    );
  }
  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  return client;
}
