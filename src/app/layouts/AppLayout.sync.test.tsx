import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sync = vi.hoisted(() => ({ outbox: vi.fn(), workspace: vi.fn(), pending: 1 }));
vi.mock("../../data/supabase/supabaseProvider", () => ({
  syncSupabaseOutbox: sync.outbox, syncSupabaseWorkspace: sync.workspace,
  getSupabaseSyncState: () => ({ pendingCount: sync.pending, isSyncing: false })
}));
vi.mock("../../features/auth/auth", () => ({ useAuth: () => ({ user: { id: "u", workspaceId: "w", name: "Agent" }, isLocked: false }) }));
vi.mock("./Sidebar", () => ({ Sidebar: () => null }));
vi.mock("../components/GlobalContractSearch", () => ({ GlobalContractSearch: () => null }));
vi.mock("../../features/auth/SessionLockScreen", () => ({ SessionLockScreen: () => null }));
import { AppLayout } from "./AppLayout";
beforeEach(() => {
  sync.pending = 1;
  sync.outbox.mockReset().mockResolvedValue(undefined);
  sync.workspace.mockReset().mockResolvedValue(false);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
it("retries pending uploads after the first reconnection request fails", async () => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  vi.useFakeTimers(); vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  sync.outbox.mockRejectedValueOnce(new Error("Network still unavailable")).mockResolvedValue(undefined);
  sync.workspace.mockResolvedValue(false);
  const view = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AppLayout /></MemoryRouter></QueryClientProvider>);
  await act(async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  expect(sync.outbox).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(sync.outbox).toHaveBeenCalledTimes(2);
  sync.pending = 0;
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(sync.outbox).toHaveBeenCalledTimes(2);
  view.unmount();
});

it("retries a failed snapshot even after all uploads have been acknowledged", async () => {
  vi.useFakeTimers(); vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  sync.outbox.mockImplementation(async () => { sync.pending = 0; });
  sync.workspace.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(false);
  const view = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AppLayout /></MemoryRouter></QueryClientProvider>);
  await act(async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  expect(sync.workspace).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(sync.workspace).toHaveBeenCalledTimes(2);
  expect(sync.workspace).toHaveBeenLastCalledWith("w", { force: false, verify: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(sync.workspace).toHaveBeenCalledTimes(2);
  view.unmount();
});

it("does not overlap synchronization when repeated online events arrive", async () => {
  vi.useFakeTimers(); vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  let finish!: () => void;
  sync.outbox.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  const view = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AppLayout /></MemoryRouter></QueryClientProvider>);
  await act(async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(sync.outbox).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  expect(sync.workspace).toHaveBeenCalledTimes(1);
  view.unmount();
});
