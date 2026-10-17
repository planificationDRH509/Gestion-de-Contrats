import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Applicant } from "../../data/types";
import { useUpdateIdentification } from "./identificationApi";

const mocks = vi.hoisted(() => ({ person: {} as Applicant }));
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({ applicants: {
  getById: async () => mocks.person,
  upsert: async (input: Applicant) => (mocks.person = { ...mocks.person, ...input })
} }) }));
let client: QueryClient;
beforeEach(() => {
  mocks.person = { id: "123-456-789-0", nif: "123-456-789-0", ninu: "1234567890", workspaceId: "w",
    firstName: "Marie", lastName: "Jean", gender: "Femme", address: "Delmas", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

it("updates an already displayed linked contract after editing its identification NINU", async () => {
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => ({
    contract: useQuery({ queryKey: ["contract", "linked-contract"], queryFn: async () => ({ id: "linked-contract", ninu: mocks.person.ninu }) }),
    update: useUpdateIdentification()
  }), { wrapper });
  await waitFor(() => expect(result.current.contract.data?.ninu).toBe("1234567890"));
  await act(async () => { await result.current.update.mutateAsync({ oldNif: mocks.person.id, workspaceId: "w", ninu: "0987654321" }); });
  await waitFor(() => expect(result.current.contract.data?.ninu).toBe("0987654321"));
  unmount();
});
