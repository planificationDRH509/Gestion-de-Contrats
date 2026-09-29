import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  vi.stubEnv("VITE_DATA_PROVIDER", "local");
  return { list: vi.fn(), contracts: [] as object[] };
});
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({ contracts: { list: mocks.list } }) }));
vi.mock("../../data/local/localDb", () => ({ selectDb: (select: Function) => select({ contracts: mocks.contracts }) }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: null }) }));
import { readCachedDossierContractMetrics, useDossierContractMetrics } from "./dossiersApi";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("dossier contract authors", () => {
  it("excludes deleted contracts and other workspaces from cached authors", () => {
    mocks.contracts = [
      { workspaceId: "w", dossierId: "d", createdBy: "me", status: "final" },
      { workspaceId: "w", dossierId: "d", createdBy: "me", status: "final" },
      { workspaceId: "w", dossierId: "d", createdBy: "other", status: "final", deletedAt: "2026-09-01" },
      { workspaceId: "elsewhere", dossierId: "d", createdBy: "other", status: "final" }
    ];
    expect(readCachedDossierContractMetrics("w").d).toEqual({ assignedCount: 2, doneCount: 2, authorIds: ["me"] });
  });

  it("collects authors across all contract pages", async () => {
    mocks.list.mockResolvedValueOnce({ total: 201, items: [
      { dossierId: "d", createdBy: "other", status: "final" }
    ] }).mockResolvedValueOnce({ total: 201, items: [
      { dossierId: "d", createdBy: "me", status: "final" },
      { dossierId: "d", createdBy: "deleted", deletedAt: "2026-09-01" }
    ] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result } = renderHook(() => useDossierContractMetrics("w"), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(result.current.data?.d.authorIds).toEqual(["other", "me"]);
    client.clear();
  });
});
