import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PersonAttachmentsDialog } from './PersonAttachmentsDialog';

const rpc = vi.hoisted(() => {
  vi.stubEnv('VITE_DATA_PROVIDER', 'supabase');
  return vi.fn();
});
vi.mock('../../data/supabase/supabaseClient', () => ({ getSupabaseClient: () => ({ rpc }) }));
vi.mock('../auth/auth', () => ({ useAuth: () => ({ user: { id: 'agent', role: 'agent', workspaceId: 'w', taskSessionToken: 'session' }, can: () => true }) }));
const person = { workspaceId: 'w', applicantId: 'person', nif: '123-456-789-0', firstName: 'Jean', lastName: 'Louis' };
const document = { id: 'document', kind: 'link', name: 'Preuve', location: 'https://example.com/preuve', createdAt: '2026-01-01' };
let client: QueryClient;
beforeEach(() => {
  rpc.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true,
    value: function (this: HTMLDialogElement) { this.open = true; } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });
async function setup() {
  render(<QueryClientProvider client={client}><PersonAttachmentsDialog person={person} onClose={() => {}} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled());
}
async function fillLink() {
  await userEvent.click(screen.getByRole('button', { name: 'Lien' }));
  await userEvent.type(screen.getByLabelText('Nom'), document.name);
  await userEvent.type(screen.getByLabelText('Lien du document'), document.location);
}

it('retries an upload with the same identifier after the server response is lost', async () => {
  rpc.mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    .mockResolvedValue({ data: [document], error: null });
  await setup();
  await fillLink();
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(await screen.findByRole('link', { name: 'Ouvrir Preuve' })).toBeInTheDocument();
  const requests = rpc.mock.calls.filter(([, args]) => args.p_action === 'add');
  expect(requests).toHaveLength(2);
  expect(requests[1][1]).toEqual(requests[0][1]);
});

it.each(['add', 'delete'] as const)('keeps a successful %s visible when an older listing finishes late', async action => {
  let release!: (value: unknown) => void;
  rpc.mockResolvedValueOnce({ data: action === 'delete' ? [document] : [], error: null })
    .mockReturnValueOnce(new Promise(resolve => { release = resolve; }))
    .mockResolvedValue({ data: action === 'delete' ? [] : [document], error: null });
  await setup();
  if (action === 'add') await fillLink();
  let refresh!: Promise<void>;
  act(() => { refresh = client.refetchQueries({ queryKey: ['person-attachments'] }); });
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  if (action === 'add') await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  else {
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer Preuve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  }
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    if (action === 'add') expect(screen.getByRole('link', { name: 'Ouvrir Preuve' })).toBeInTheDocument();
    else expect(screen.queryByRole('link', { name: 'Ouvrir Preuve' })).not.toBeInTheDocument();
  });
  await act(async () => { release({ data: action === 'delete' ? [document] : [], error: null }); await refresh; });
  expect(client.getQueriesData({ queryKey: ['person-attachments'] })[0][1]).toEqual(action === 'delete' ? [] : [document]);
  if (action === 'add') expect(screen.getByRole('link', { name: 'Ouvrir Preuve' })).toBeInTheDocument();
  else expect(screen.queryByRole('link', { name: 'Ouvrir Preuve' })).not.toBeInTheDocument();
});
