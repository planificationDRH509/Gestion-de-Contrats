import { createElement, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { getPendingOutbox } from "../../data/local/offlineStore";

vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "u", workspaceId: "w" } }) }));
const network = vi.hoisted(() => vi.fn(() => { throw new Error("Unexpected network request"); }));
vi.mock("../../data/supabase/supabaseClient", () => ({ getSupabaseClient: network }));
vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
const { useApplicantUpsert, useCreateContract } = await import("./contractsApi");
afterEach(() => { onlineManager.setOnline(true); vi.unstubAllEnvs(); });

it("persists both identity and contract while React Query considers the device offline", async () => {
  localStorage.clear();
  onlineManager.setOnline(false);
  const client = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  const { result, unmount } = renderHook(() => ({ applicant: useApplicantUpsert(), contract: useCreateContract() }), { wrapper });
  await act(async () => {
    const input = { workspaceId: "w", nif: "123-456-789-0", gender: "Homme" as const, firstName: "Jean", lastName: "Louis", address: "Delmas" };
    const person = await result.current.applicant.mutateAsync({ ...input, queueLocally: true });
    await result.current.contract.mutateAsync({ ...input, applicantId: person.id, status: "saisie", position: "Agent", assignment: "MSPP", salaryNumber: 30000, salaryText: "trente mille", durationMonths: 12 });
  });
  expect(getPendingOutbox().map(item => item.type)).toEqual(["applicant.upsert", "contract.create"]);
  expect(network).not.toHaveBeenCalled();
  unmount();
  client.clear();
});
