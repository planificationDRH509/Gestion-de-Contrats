import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import { CreateDossierInput, UpdateDossierInput } from "../../data/types";
import { isContractDone } from "../../lib/dossier";
import { readCachedDossiers } from "../../data/local/localDossierRepository";
import { hasWorkspaceOfflineCache } from "../../data/local/offlineStore";
import { selectDb } from "../../data/local/localDb";

const provider = getDataProvider();
const usesSupabase = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";

export type DossierContractMetrics = Record<
  string,
  {
    assignedCount: number;
    doneCount: number;
  }
>;

export function readCachedDossierContractMetrics(workspaceId: string): DossierContractMetrics {
  return selectDb((db) => {
    const metrics: DossierContractMetrics = {};
    db.contracts.forEach((contract) => {
      if (
        contract.workspaceId !== workspaceId ||
        contract.deletedAt ||
        !contract.dossierId
      ) {
        return;
      }

      const dossierMetrics = metrics[contract.dossierId] ?? {
        assignedCount: 0,
        doneCount: 0
      };
      dossierMetrics.assignedCount += 1;
      if (isContractDone(contract.status)) dossierMetrics.doneCount += 1;
      metrics[contract.dossierId] = dossierMetrics;
    });
    return metrics;
  });
}

export function useDossiersList(workspaceId: string) {
  return useQuery({
    queryKey: ["dossiers", workspaceId],
    queryFn: () => provider.dossiers.list(workspaceId),
    enabled: Boolean(workspaceId),
    initialData: usesSupabase
      ? () => hasWorkspaceOfflineCache(workspaceId) ? readCachedDossiers(workspaceId) : undefined
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true,
  });
}

export function useDossierContractMetrics(workspaceId: string) {
  return useQuery({
    queryKey: ["dossiers", "metrics", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      // Supabase workspaces already keep a complete local snapshot. Reusing it
      // avoids downloading every contract again just to calculate counters.
      if (usesSupabase) {
        return readCachedDossierContractMetrics(workspaceId);
      }

      const pageSize = 200;
      let page = 1;
      let total = 0;
      const metrics: DossierContractMetrics = {};

      do {
        const result = await provider.contracts.list({
          workspaceId,
          page,
          pageSize,
          sort: "createdAt_desc"
        });

        total = result.total;
        result.items.forEach((contract) => {
          if (!contract.dossierId) {
            return;
          }

          if (!metrics[contract.dossierId]) {
            metrics[contract.dossierId] = {
              assignedCount: 0,
              doneCount: 0
            };
          }

          metrics[contract.dossierId].assignedCount += 1;
          if (isContractDone(contract.status)) {
            metrics[contract.dossierId].doneCount += 1;
          }
        });

        page += 1;
      } while ((page - 1) * pageSize < total);

      return metrics;
    },
    initialData: usesSupabase
      ? () => hasWorkspaceOfflineCache(workspaceId)
        ? readCachedDossierContractMetrics(workspaceId)
        : undefined
      : undefined,
    initialDataUpdatedAt: 0
  });
}

export function useCreateDossier() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDossierInput) => 
      provider.dossiers.create({ ...input, createdBy: user?.id } as any),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dossiers", variables.workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useUpdateDossier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDossierInput) => provider.dossiers.update(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dossiers", variables.workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
    }
  });
}

export function useDeleteDossier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      workspaceId
    }: {
      id: string;
      workspaceId: string;
    }) => provider.dossiers.delete(id, workspaceId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dossiers", variables.workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["dossiers", "metrics", variables.workspaceId]
      });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    }
  });
}
