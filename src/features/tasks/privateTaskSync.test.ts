import 'fake-indexeddb/auto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { flushPrivateTaskOutbox } from './privateTaskSync';
import { queueOfflineTaskCreation, queueOfflineTaskEdit, queueOfflineTaskDeletion, readPrivateTaskOfflineState } from './privateTaskOffline';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../data/supabase/supabaseClient', () => ({ getSupabaseClient: () => ({ rpc }) }));
let user: { id: string; taskSessionToken: string };
const create = (content: string) => queueOfflineTaskCreation(user.taskSessionToken, {
  userId: user.id, userName: 'Test', username: 'test', content, assigneeId: null
});
const state = () => readPrivateTaskOfflineState(user.id, user.taskSessionToken);
beforeEach(() => {
  user = { id: crypto.randomUUID(), taskSessionToken: 'session' };
  rpc.mockReset();
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

it('can dismiss a task deleted on another device without losing its pending edit beforehand', async () => {
  const { replaceCachedPrivateTasks } = await import('./privateTaskOffline');
  await replaceCachedPrivateTasks(user.id, user.taskSessionToken, [{ id: 'remote-task', content: 'Task', notes: '', kind: 'task',
    status: 'todo', completed: false, completedAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    createdBy: user.id, createdByName: 'Test', createdByUsername: 'test' }]);
  await queueOfflineTaskEdit(user.id, user.taskSessionToken, 'remote-task', 'Local edit', '');
  rpc.mockImplementation(async (_name, args) => args.p_operation.type === 'edit'
    ? { data: null, error: { code: 'P0001', message: 'TASK_NOT_FOUND' } }
    : { data: 'remote-task', error: null });
  await expect(flushPrivateTaskOutbox(user)).rejects.toMatchObject({ message: 'TASK_NOT_FOUND' });
  expect((await state()).tasks[0].content).toBe('Local edit');
  expect((await state()).outbox).toMatchObject([{ type: 'edit', missing: true }]);
  const request = structuredClone(rpc.mock.calls[0][1]);
  await expect(flushPrivateTaskOutbox(user)).rejects.toMatchObject({ message: 'TASK_NOT_FOUND' });
  expect(rpc.mock.calls[1][1]).toEqual(request);
  await queueOfflineTaskDeletion(user.id, user.taskSessionToken, 'remote-task');
  expect(await flushPrivateTaskOutbox(user)).toBe(0);
  expect((await state()).tasks).toEqual([]);
  expect((await state()).outbox).toEqual([]);
});

it('clears a deletion queued while a missing-task response is still in flight', async () => {
  await queueOfflineTaskEdit(user.id, user.taskSessionToken, 'remote-task', 'Local edit', '');
  let release!: (value: unknown) => void;
  rpc.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  const pass = flushPrivateTaskOutbox(user);
  const rejected = expect(pass).rejects.toMatchObject({ message: 'TASK_NOT_FOUND' });
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
  await queueOfflineTaskDeletion(user.id, user.taskSessionToken, 'remote-task');
  release({ data: null, error: { code: 'P0001', message: 'TASK_NOT_FOUND' } });
  await rejected;
  expect((await state()).outbox).toEqual([]);
  expect(await flushPrivateTaskOutbox(user)).toBe(0);
});

it('continues independent tasks after a rejection and keeps dependent changes for retry', async () => {
  const rejected = await create('Rejected');
  await queueOfflineTaskEdit(user.id, user.taskSessionToken, rejected.id, 'Local correction', 'Notes');
  const independent = await create('Independent');
  rpc.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'Task rejected' } })
    .mockResolvedValue({ data: 'remote-independent', error: null });
  await expect(flushPrivateTaskOutbox(user)).rejects.toMatchObject({ message: 'Task rejected' });
  expect(rpc).toHaveBeenCalledTimes(2);
  expect((await state()).outbox).toMatchObject([{ type: 'create', tempTaskId: rejected.id }, { type: 'edit', taskId: rejected.id }]);
  expect((await state()).tasks.some(task => task.id === independent.id)).toBe(false);
  expect((await state()).tasks.some(task => task.id === 'remote-independent')).toBe(true);
  rpc.mockResolvedValue({ data: 'remote-recovered', error: null });
  expect(await flushPrivateTaskOutbox(user)).toBe(2);
  expect((await state()).outbox).toEqual([]);
  expect(rpc.mock.calls.at(-1)![1].p_operation).toMatchObject({ type: 'edit', taskId: 'remote-recovered' });
});

it.each([{ message: 'Failed to fetch' }, { status: 429, message: 'Busy' }, { code: '40001', message: 'Serialization failure' }])(
  'keeps an identical request after a temporary failure: %j', async error => {
    await create('First');
    await create('Second');
    rpc.mockResolvedValueOnce({ data: null, error });
    await expect(flushPrivateTaskOutbox(user)).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledOnce();
    expect((await state()).outbox).toHaveLength(2);
    const first = structuredClone(rpc.mock.calls[0][1]);
    rpc.mockImplementation(async (_name, args) => ({ data: `remote-${args.p_request_id}`, error: null }));
    expect(await flushPrivateTaskOutbox(user)).toBe(2);
    expect(rpc.mock.calls[1][1]).toEqual(first);
    expect((await state()).outbox).toEqual([]);
  }
);

it('preserves a deletion during a lost creation response without creating a second task', async () => {
  const task = await create('Creation in flight');
  let release!: (value: unknown) => void;
  rpc.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  const firstPass = flushPrivateTaskOutbox(user);
  const rejected = expect(firstPass).rejects.toMatchObject({ message: 'Failed to fetch' });
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
  const request = structuredClone(rpc.mock.calls[0][1]);
  await queueOfflineTaskDeletion(user.id, user.taskSessionToken, task.id);
  release({ data: null, error: { message: 'Failed to fetch' } });
  await rejected;
  rpc.mockResolvedValue({ data: 'existing-server-task', error: null });
  expect(await flushPrivateTaskOutbox(user)).toBe(2);
  expect(rpc.mock.calls[1][1]).toEqual(request);
  expect(rpc.mock.calls[2][1].p_operation).toMatchObject({ type: 'delete', taskId: 'existing-server-task' });
  expect((await state()).tasks).toEqual([]);
  expect((await state()).outbox).toEqual([]);
});

it('serializes simultaneous synchronization requests without replaying acknowledged tasks', async () => {
  await create('Only once');
  rpc.mockResolvedValue({ data: 'server-task', error: null });
  expect(await Promise.all([flushPrivateTaskOutbox(user), flushPrivateTaskOutbox(user)])).toEqual([1, 0]);
  expect(rpc).toHaveBeenCalledOnce();
  expect((await state()).outbox).toEqual([]);
});
