import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LEGACY_MINISTER } from '../../lib/ministers';
import seed from '../salary-grid/salaryGridSeed.json';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), role: 'admin' }));
vi.mock('../auth/auth', () => ({ useAuth: () => ({ user: { id: 'admin', workspaceId: 'w', taskSessionToken: 'session', role: mocks.role }, can: () => mocks.role === 'admin' }) }));
vi.mock('../../data/supabase/supabaseClient', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.stubEnv('VITE_DATA_PROVIDER', 'supabase');
const { useSalaryGrid } = await import('../salary-grid/salaryGridApi');
const { useMinisters } = await import('./ministersApi');
const { useInstitutionPrepositions } = await import('../institutions/institutionPrepositionsApi');
const { useInstitutionCatalogue } = await import('../institutions/institutionsApi');
const { cacheSalaryGrid, readSalaryGridCache } = await import('../salary-grid/salaryGridCache');
const { cacheMinisters, readMinistersCache } = await import('./ministersCache');
const { cacheSuggestions, getAddresses, getInstitutions, hasCachedSuggestions } = await import('../../data/local/suggestionsDb');
const { readInstitutionPrepositions } = await import('../institutions/institutionPrepositions');
const { getPendingOutbox, cacheContracts, setWorkspaceSyncMetadata } = await import('../../data/local/offlineStore');
const { createSupabaseProvider, syncSupabaseOutbox } = await import('../../data/supabase/supabaseProvider');
const { queueReferenceChange } = await import('../../data/local/referenceQueue');
let client: QueryClient;
const institution = { id: 'i', label: 'Centre de Santé', institutionType: 'Centre de Santé', addressKeywords: [], order: 0, version: 1 };
const wrapper = ({children}: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  localStorage.clear();
  mocks.role = 'admin';
  localStorage.setItem('contribution_auth', JSON.stringify({ id: 'admin', workspaceId: 'w', role: 'admin', taskSessionToken: 'session' }));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  mocks.rpc.mockReset().mockImplementation(() => new Promise(() => {}));
  mocks.from.mockReset().mockImplementation(() => { throw new Error('Unexpected network wait'); });
  cacheSalaryGrid([seed[0]]);
  cacheMinisters({ ministers: [LEGACY_MINISTER], currentMinisterId: LEGACY_MINISTER.id });
  cacheSuggestions({ addresses: [], positions: [], institutions: [institution] }, 'w');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });

it('saves all shared references while their remote reads never resolve', async () => {
  const view = renderHook(() => ({ salary: useSalaryGrid(), ministers: useMinisters(), prepositions: useInstitutionPrepositions(), institutions: useInstitutionCatalogue() }), {wrapper});
  await act(async () => {
    await view.result.current.salary.save({ ...seed[0], notes: 'local' });
    await view.result.current.prepositions.save([{ ...readInstitutionPrepositions()[0], prefix: 'auprès de' }]);
    await view.result.current.ministers.save({ action: 'mandate', ministerId: LEGACY_MINISTER.id, mandateStartDate: '2021-01-01', mandateEndDate: null, expectedStartDate: LEGACY_MINISTER.mandateStartDate!, expectedEndDate: null });
    await view.result.current.institutions.save({ ...institution, label: 'Centre de Santé local' });
  });
  expect(getPendingOutbox()).toHaveLength(4);
  await waitFor(() => expect(view.result.current.salary.entries[0]).toMatchObject({ notes: 'local', version: 2 }));
  expect(view.result.current.institutions.entries[0]).toMatchObject({ label: 'Centre de Santé local', version: 2 });
  expect(readMinistersCache()?.ministers[0].mandateStartDate).toBe('2021-01-01');
  expect(mocks.rpc.mock.calls.every(call => String(call[0]).startsWith('read_'))).toBe(true);
  view.unmount(); client.clear();
  const restored = renderHook(() => useSalaryGrid(), {wrapper});
  expect(restored.result.current.entries[0].notes).toBe('local');
});

it('overlays an edit over a delayed server response, including an empty cache', async () => {
  let finish!: (reply: unknown) => void;
  mocks.rpc.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useSalaryGrid(), {wrapper});
  await act(async () => { await result.current.save({ ...seed[0], notes: 'pending' }); });
  await act(async () => { finish({ data: [seed[0]], error: null }); });
  await waitFor(() => expect(result.current.entries[0].notes).toBe('pending'));
  cacheSalaryGrid([]);
  expect(readSalaryGridCache()?.[0].notes).toBe('pending');
});

it.each([true, false])('reads cached suggestions and durably learns new values without a server (online: %s)', async online => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
  const repo = createSupabaseProvider().suggestions;
  expect(await repo.getAddresses('w')).toEqual([]);
  const added = await repo.addAddress('w', 'Delmas');
  await repo.updateAddress(added.id, 'Delmas 33');
  expect(getAddresses()[0].label).toBe('Delmas 33');
  cacheSuggestions({ addresses: [] }, 'w');
  expect(getAddresses()[0].label).toBe('Delmas 33');
  await repo.deleteAddress(added.id);
  expect(getAddresses()).toEqual([]);
  expect(getPendingOutbox()).toHaveLength(3);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('contribution_local_db')!).outbox).toHaveLength(3);
});

it('isolates suggestion snapshots and pending edits by workspace', async () => {
  await createSupabaseProvider().suggestions.addAddress('w', 'Local');
  cacheSuggestions({ addresses: [{ id: 'other', label: 'Other', order: 0 }] }, 'other');
  expect(getAddresses('other').map(a => a.label)).toEqual(['Other']);
  expect(getAddresses('w').map(a => a.label)).toEqual(['Local']);
  expect(hasCachedSuggestions('institutions', 'other')).toBe(false);
});

it('keeps a newer edit visible while acknowledging an earlier operation', async () => {
  const repo = createSupabaseProvider().suggestions;
  const added = await repo.addAddress('w', 'Initial');
  let finish!: (reply: unknown) => void;
  mocks.rpc.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const syncing = syncSupabaseOutbox();
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('sync_reference_change', expect.anything()));
  await repo.updateAddress(added.id, 'Newer');
  finish({ data: added, error: null });
  await syncing;
  expect(getPendingOutbox()).toHaveLength(1);
  expect(getAddresses()[0].label).toBe('Newer');
});

it('remaps a learned institution before replaying its dependent edit', async () => {
  const repo = createSupabaseProvider().suggestions;
  const added = await repo.addInstitution('w', 'Hôpital local', []);
  await repo.updateInstitution(added.id, 'Hôpital renommé', []);
  mocks.rpc.mockImplementation(async (_name, args) => ({ data: { ...args.p_change.patches[0].after, id: 'server-id' }, error: null }));
  await syncSupabaseOutbox();
  expect(mocks.rpc.mock.calls[1][1].p_change.patches[0]).toMatchObject({ id: 'server-id', before: { id: 'server-id' }, after: { id: 'server-id' } });
  expect(getPendingOutbox()).toHaveLength(0);
  expect(getInstitutions().find(e => e.id === 'server-id')?.label).toBe('Hôpital renommé');
});

it('preserves rejected reference edits and blocks only dependent references', async () => {
  const repo = createSupabaseProvider().suggestions;
  const added = await repo.addAddress('w', 'Local');
  await repo.updateAddress(added.id, 'Newer');
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Référence modifiée ailleurs.' } });
  await syncSupabaseOutbox();
  expect(getPendingOutbox()).toHaveLength(2);
  expect(getPendingOutbox()[0].lastError).toBeTruthy();
  expect(getAddresses()[0].label).toBe('Newer');
  expect(mocks.rpc).toHaveBeenCalledOnce();
});

it('rejects reference writes by another workspace or a reader', async () => {
  await expect(queueReferenceChange('other', { scope: 'addresses', patches: [] })).rejects.toThrow('Session');
  localStorage.setItem('contribution_auth', JSON.stringify({ id: 'reader', workspaceId: 'w', role: 'reader', taskSessionToken: 'session' }));
  await expect(createSupabaseProvider().suggestions.addAddress('w', 'Forbidden')).rejects.toThrow('autorisée');
  expect(getPendingOutbox()).toHaveLength(0);
});

it('reads a fully cached trash without asking the server', async () => {
  const contract = { id: 'deleted', workspaceId: 'w', firstName: 'Jean', lastName: 'Test', assignment: 'Centre', status: 'saisie', salaryNumber: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01', deletedAt: '2026-01-02' };
  cacheContracts([contract as never]);
  setWorkspaceSyncMetadata('w', { lastTrashSyncedAt: new Date().toISOString() });
  const result = await createSupabaseProvider().contracts.list({ workspaceId: 'w', all: true, deletionState: 'deleted', dateFilterMode: 'all' });
  expect(result.items.map(item => item.id)).toEqual(['deleted']);
  expect(mocks.from).not.toHaveBeenCalled();
});
