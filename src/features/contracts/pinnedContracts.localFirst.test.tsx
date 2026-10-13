import type { PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPendingOutbox } from "../../data/local/offlineStore";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: {
  id: "pin-user", workspaceId: "w", taskSessionToken: "session"
} }) }));
vi.mock("../../data/supabase/supabaseClient", () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
const { usePinnedContracts } = await import("./pinnedContracts");
let client: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.rpc.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });

it("queues pin changes while online without waiting for a blocked read", async () => {
  let finish!: (value: unknown) => void;
  mocks.rpc.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => usePinnedContracts(), { wrapper });
  await act(async () => { await result.current.toggle("c1"); });
  await waitFor(() => {
    expect(result.current.ids).toEqual(["c1"]);
    expect(result.current.isPending).toBe(false);
  });
  expect(getPendingOutbox()).toEqual([expect.objectContaining({ type: "pin.set", payload: {
    userId: "pin-user", contractId: "c1", pinned: true
  } })]);
  await act(async () => { finish({ data: [], error: null }); });
  expect(result.current.ids).toEqual(["c1"]);
  expect(mocks.rpc.mock.calls.every(call => call[0] === "read_pinned_contracts")).toBe(true);
});

it("restores pending pins after remount and permits offline unpinning", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const first = renderHook(() => usePinnedContracts(), { wrapper });
  await act(async () => { await first.result.current.toggle("c1"); });
  first.unmount(); client.clear();
  const second = renderHook(() => usePinnedContracts(), { wrapper });
  await waitFor(() => expect(second.result.current.ids).toEqual(["c1"]));
  await act(async () => { await second.result.current.toggle("c1"); });
  await waitFor(() => expect(second.result.current.ids).toEqual([]));
  expect(getPendingOutbox().map(item => item.payload.pinned)).toEqual([true, false]);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
