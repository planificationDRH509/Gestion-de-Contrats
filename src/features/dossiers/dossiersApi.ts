import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth";
import { getDataProvider } from "../../data/dataProvider";
import { CreateDossierInput, UpdateDossierInput } from "../../data/types";
import { isContractDone } from "../../lib/dossier";

const provider = getDataProvider();

export type DossierContractMetrics = Record<
  string,
  {
    assignedCount: number;
    doneCount: number;
  }
>;

export function useDossiersList(workspaceId: string) {
  return useQuery({
    queryKey: ["dossiers", workspaceId],
    queryFn: () => provider.dossiers.list(workspaceId),
    enabled: Boolean(workspaceId)
  });
}

export function useDossierContractMetrics(workspaceId: string) {
  return useQuery({
    queryKey: ["dossiers", "metrics", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
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
    }
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
