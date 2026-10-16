import type { PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ storage: new Map<string, unknown>(), rpc: vi.fn() }));
vi.mock("idb-keyval", () => ({
  get: async (key: string) => mocks.storage.get(key),
  update: async (key: string, fn: (value: unknown) => unknown) => mocks.storage.set(key, fn(mocks.storage.get(key)))
}));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: {
  id: "local-user", name: "Jean", username: "jean", workspaceId: "w", taskSessionToken: "session"
} }) }));
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({}) }));
vi.mock("../../data/supabase/supabaseClient", () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
import { useCreatePrivateTask, useDeletePrivateTask, useEditPrivateTask, usePrivateTasks, useSetTaskStatus } from "./tasksApi";
import { readPrivateTaskOfflineState, replaceCachedPrivateTasks } from "./privateTaskOffline";

const task = {
  id: "cached-task", content: "Disponible", notes: "", kind: "task" as const, status: "todo" as const,
  completed: false, completedAt: null, createdAt: "2026-09-01", updatedAt: "2026-09-01",
  createdBy: "local-user", createdByName: "Jean", createdByUsername: "jean"
};
let client: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(async () => {
  mocks.storage.clear();
  mocks.rpc.mockReset().mockImplementation(() => new Promise(() => {}));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await replaceCachedPrivateTasks("local-user", "session", [task]);
});
afterEach(() => { cleanup(); client.clear(); onlineManager.setOnline(true); });

it.each(['TASK_NOT_FOUND', 'TASK_CONTENT_INVALID'])('refreshes unrelated remote tasks while preserving a rejected local edit: %s', async message => {
  const { queueOfflineTaskEdit } = await import('./privateTaskOffline');
  await queueOfflineTaskEdit('local-user', 'session', task.id, 'Local edit', '');
  mocks.rpc.mockImplementation(async name => name === 'sync_private_task'
    ? { data: null, error: { code: 'P0001', message } }
    : { data: [{ id: 'new-remote-task', content: 'New remote task', status: 'todo', created_at: '2026-01-01',
      updated_at: '2026-01-01', created_by: 'local-user', created_by_name: 'Jean', created_by_username: 'jean' }], error: null });
  const { result } = renderHook(() => usePrivateTasks(), { wrapper });
  await waitFor(() => expect(result.current.isFetching).toBe(false));
  expect(mocks.rpc).toHaveBeenCalledWith('list_private_tasks', { p_session_token: 'session' });
  expect(result.current.data).toEqual([
    expect.objectContaining({ id: task.id, content: 'Local edit' }),
    expect.objectContaining({ id: 'new-remote-task', content: 'New remote task' })
  ]);
  expect(result.current.error).toMatchObject({ message });
  expect((await readPrivateTaskOfflineState('local-user', 'session')).outbox).toHaveLength(1);
});

it("renders the encrypted cache while the online refresh never responds", async () => {
  const { result } = renderHook(() => usePrivateTasks(), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual([task]));
  expect(result.current.isLoading).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledWith("list_private_tasks", { p_session_token: "session" });
});

it("saves all task mutations locally without awaiting the online server", async () => {
  const { result } = renderHook(() => ({ create: useCreatePrivateTask(), edit: useEditPrivateTask(),
    status: useSetTaskStatus(), remove: useDeletePrivateTask() }), { wrapper });
  await act(async () => {
    await result.current.edit.mutateAsync({ taskId: task.id, content: "Modifié", notes: "Local" });
    await result.current.status.mutateAsync({ taskId: task.id, status: "done" });
    await result.current.create.mutateAsync({ content: "Nouvelle tâche", assigneeId: null });
    await result.current.remove.mutateAsync(task.id);
  });
  const state = await readPrivateTaskOfflineState("local-user", "session");
  expect(state.tasks).toEqual([expect.objectContaining({ content: "Nouvelle tâche" })]);
  expect(state.outbox.map(item => item.type)).toEqual(["create", "delete"]);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(result.current.create.isPending).toBe(false);
});

it("runs local task mutations even when React Query reports an offline connection", async () => {
  onlineManager.setOnline(false);
  const { result } = renderHook(() => useCreatePrivateTask(), { wrapper });
  await act(async () => { await result.current.mutateAsync({ content: "Hors ligne", assigneeId: null }); });
  expect((await readPrivateTaskOfflineState("local-user", "session")).outbox).toHaveLength(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
