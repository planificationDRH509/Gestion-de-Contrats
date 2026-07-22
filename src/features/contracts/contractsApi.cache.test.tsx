import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "../../data/types";
import { replaceWorkspaceCache, setWorkspaceSyncMetadata } from "../../data/local/offlineStore";

const providerMocks = vi.hoisted(() => ({
  listContracts: vi.fn()
}));

vi.mock("../../data/dataProvider", () => ({
  getDataProvider: () => ({
    contracts: {
      list: providerMocks.listContracts
    }
  })
}));

vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
const { useContractsList } = await import("./contractsApi");

beforeEach(() => {
  localStorage.clear();
  providerMocks.listContracts.mockReset();
});

describe("useContractsList offline-first loading", () => {
  it("renders the offline page while the remote refresh is still pending", () => {
    const workspaceId = "workspace_cache_first";
    const cachedContract: Contract = {
      id: "contract_cached",
      workspaceId,
      applicantId: null,
      dossierId: null,
      status: "saisie",
      gender: "Femme",
      firstName: "Marie",
      lastName: "Jean",
      nif: "111-111-111-1",
      ninu: null,
      address: "Delmas",
      position: "Analyste",
      assignment: "Planification",
      salaryNumber: 45_000,
      salaryText: "quarante-cinq mille",
      durationMonths: 12,
      createdAt: "2026-07-21T12:00:00.000Z",
      updatedAt: "2026-07-21T12:00:00.000Z"
    };
    replaceWorkspaceCache(workspaceId, {
      applicants: [],
      contracts: [cachedContract],
      dossiers: [],
      tags: []
    });
    setWorkspaceSyncMetadata(workspaceId, {
      lastSyncedAt: "2026-07-21T12:00:00.000Z",
      lastFullSyncedAt: "2026-07-21T12:00:00.000Z"
    });

    providerMocks.listContracts.mockImplementation(() => new Promise(() => undefined));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(
      () => useContractsList({ workspaceId, page: 1, pageSize: 25 }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.data?.items).toEqual([{ ...cachedContract, tags: [] }]);
    expect(providerMocks.listContracts).toHaveBeenCalledOnce();

    unmount();
    queryClient.clear();
  });
});
