import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../auth/auth";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { sqliteApiRequest } from "../../data/local/sqliteApiClient";
import { validateMinister, validateMandate, type Minister, type MinisterRegistry } from "../../lib/ministers";
import { cacheMinisters, readMinistersCache } from "./ministersCache";
import type { Json } from "../../data/supabase/database.types";

export function useMinisters() {
  const { user, can, isLocked } = useAuth();
  const client = useQueryClient();
  const remote = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";
  const queryKey = ["ministers", user?.id ?? ""];
  const query = useQuery<MinisterRegistry>({
    queryKey, enabled: Boolean(user) && !isLocked,
    initialData: readMinistersCache, initialDataUpdatedAt: 0,
    staleTime: 10_000, refetchInterval: 30_000, refetchOnReconnect: "always", refetchOnWindowFocus: "always",
    queryFn: async () => {
      let registry: MinisterRegistry;
      if (!remote) registry = await sqliteApiRequest<MinisterRegistry>("/ministers");
      else {
        if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
        const { data, error } = await getSupabaseClient().rpc("read_ministers", { p_session_token: user.taskSessionToken });
        if (error) throw error;
        registry = data as unknown as MinisterRegistry;
      }
      if (!registry?.ministers?.some(m => m.id === registry.currentMinisterId)) throw new Error("Liste des ministres indisponible.");
      cacheMinisters(registry);
      return registry;
    }
  });
  useEffect(() => {
    const refresh = () => {
      const registry = readMinistersCache();
      if (registry) client.setQueryData(queryKey, registry);
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [client, user?.id]);
  const mutation = useMutation({
    networkMode: "always",
    mutationFn: async (input: { action: "add"; minister: Minister } | { action: "select"; ministerId: string } | {
      action: "mandate"; ministerId: string; mandateStartDate: string; mandateEndDate: string | null;
      expectedStartDate: string | null; expectedEndDate: string | null;
    }) => {
      if (!can("settings.manage")) throw new Error("Modification réservée aux administrateurs.");
      if (input.action === "add") input = { ...input, minister: validateMinister(input.minister) };
      if (input.action === "mandate") input = { ...input, ...validateMandate(input.mandateStartDate, input.mandateEndDate) };
      if (!remote) return sqliteApiRequest<MinisterRegistry>("/ministers", { method: "POST", body: input });
      if (!navigator.onLine) throw new Error("Connectez-vous pour modifier les ministres.");
      if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
      const { data, error } = await getSupabaseClient().rpc("manage_ministers", { p_session_token: user.taskSessionToken, p_input: input as unknown as Json });
      if (error) throw error;
      return data as unknown as MinisterRegistry;
    },
    onSuccess: registry => {
      cacheMinisters(registry);
      client.setQueryData(queryKey, registry);
      void client.invalidateQueries({ queryKey: ["ministers"] });
    }
  });
  return { ...query, registry: query.data, save: mutation.mutateAsync, saving: mutation.isPending };
}
