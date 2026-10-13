import { queueReferenceChange } from '../../data/local/referenceQueue';
import type { ReferencePatch } from '../../data/local/referenceOverlay';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../auth/auth";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { sqliteApiRequest } from "../../data/local/sqliteApiClient";
import { validateMinister, validateMandate, type Minister, type MinisterRegistry } from "../../lib/ministers";
import { cacheMinisters, readMinistersCache } from "./ministersCache";

export function useMinisters() {
  const { user, can, isLocked } = useAuth();
  const client = useQueryClient();
  const remote = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";
  const queryKey = ["ministers", user?.id ?? ""];
  const query = useQuery<MinisterRegistry>({
    queryKey, enabled: Boolean(user) && !isLocked,
    initialData: readMinistersCache, initialDataUpdatedAt: 0,
    staleTime: 10_000, refetchInterval: 30_000, refetchOnReconnect: "always", refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      const local = readMinistersCache();
      if (local) client.setQueryData(queryKey, local);
      if (!navigator.onLine && local) return local;
      let registry: MinisterRegistry;
      if (!remote) registry = await sqliteApiRequest<MinisterRegistry>("/ministers");
      else {
        if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
        const { data, error } = await getSupabaseClient().rpc("read_ministers", { p_session_token: user.taskSessionToken });
        if (error) throw error;
        registry = data as unknown as MinisterRegistry;
      }
      if (!registry?.ministers?.some(m => m.id === registry.currentMinisterId)) throw new Error("Liste des ministres indisponible.");
      if (signal.aborted) return readMinistersCache()!;
      cacheMinisters(registry);
      return readMinistersCache() ?? registry;
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
    onMutate: () => client.cancelQueries({ queryKey }),
    networkMode: "always",
    mutationFn: async (input: { action: "add"; minister: Minister } | { action: "select"; ministerId: string } | {
      action: "mandate"; ministerId: string; mandateStartDate: string; mandateEndDate: string | null;
      expectedStartDate: string | null; expectedEndDate: string | null;
    }) => {
      if (!can("settings.manage")) throw new Error("Modification réservée aux administrateurs.");
      if (input.action === "add") input = { ...input, minister: validateMinister(input.minister) };
      if (input.action === "mandate") input = { ...input, ...validateMandate(input.mandateStartDate, input.mandateEndDate) };
      if (!remote) return sqliteApiRequest<MinisterRegistry>("/ministers", { method: "POST", body: input });
      const registry = readMinistersCache();
      if (!registry) throw new Error('Liste des ministres indisponible.');
      const patches: ReferencePatch[] = [];
      if (input.action === 'add') {
        if (registry.ministers.some(m => m.id === input.minister.id || m.nif === input.minister.nif || m.ninu === input.minister.ninu)) throw new Error('Ce ministre existe déjà.');
        patches.push({ id: input.minister.id, before: null, after: input.minister });
      } else {
        const before = registry.ministers.find(m => m.id === input.ministerId);
        if (!before) throw new Error('Ministre introuvable.');
        if (input.action === 'mandate') {
          if ((before.mandateStartDate ?? null) !== input.expectedStartDate || (before.mandateEndDate ?? null) !== input.expectedEndDate) throw new Error('Le mandat a changé. Rechargez les ministres.');
          patches.push({ id: before.id, before, after: { ...before, mandateStartDate: input.mandateStartDate, mandateEndDate: input.mandateEndDate } });
        }
      }
      await queueReferenceChange(user!.workspaceId, { scope: 'ministers', patches,
        input: input.action === 'select' ? { ...input, expectedMinisterId: registry.currentMinisterId } : input });
      return readMinistersCache()!;
    },
    onSuccess: registry => {
      if (!remote) cacheMinisters(registry);
      client.setQueryData(queryKey, registry);
      void client.invalidateQueries({ queryKey: ["ministers"] });
    }
  });
  return { ...query, registry: query.data, save: mutation.mutateAsync, saving: mutation.isPending };
}
