import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ContractList } from "./listModel";
import { ListsPage } from "./ListsPage";
const mocks = vi.hoisted(() => ({ role: 'admin', lists: [] as ContractList[], mutate: vi.fn(), exportExcel: vi.fn(), error: null as Error | null }));
vi.mock('../auth/auth', () => ({ useAuth: () => ({user: { id:'u',workspaceId:'w',role:mocks.role },can: () => mocks.role !== 'reader'}) }));
vi.mock('./listsApi', () => ({useContractLists: () => ({data:mocks.lists,isPending:false,error:null,refetch:vi.fn()}),useListOperation: () => ({mutateAsync:mocks.mutate,isPending:false,error:mocks.error})}));
vi.mock('../contracts/contractsApi', () => ({useContractsList: () => ({data:{items:[]},isPending:false})}));
vi.mock('./ListAssignmentDialog', () => ({ListAssignmentDialog: () => null}));
vi.mock('./downloadListExcel', () => ({downloadListExcel: mocks.exportExcel}));
function mount() { return render(<MemoryRouter initialEntries={['/app/listes?liste=l1']}><ListsPage /></MemoryRouter>); }
beforeEach(() => {
  cleanup(); mocks.role='admin'; mocks.error=null; mocks.mutate.mockReset().mockResolvedValue('new-list');
  mocks.exportExcel.mockReset().mockResolvedValue(undefined);
  mocks.lists=[{id:'l1',workspaceId:'w',durationMonths:6,visaNumber:null,sealedAt:null,version:4,createdAt:'2026-09-20T00:00:00Z',history:[],members:[
    {id:'c1',firstName:'Louvens',lastName:'Louis',nif:'111',salaryNumber:100,durationMonths:6,position:'Infirmier'},
    {id:'c2',firstName:'Ana',lastName:'Étienne',nif:'222',salaryNumber:200,durationMonths:6,position:'Médecin'}
  ]}];
});
describe('ListsPage', () => {
  it('shows the automatic lot name, alphabetical contents and duration totals', () => {
    mount(); expect(screen.getByRole('heading',{name:'LOT-2-ÉTIENNE-Ana'})).toBeInTheDocument();
    const rows=within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('ÉTIENNE Ana'); expect(rows[2]).toHaveTextContent('LOUIS Louvens');
    expect(screen.getAllByText('1,800.00 HTG')).toHaveLength(2);
    expect(screen.queryByText('Scellée')).not.toBeInTheDocument();
  });
  it('creates a list with a chosen duration and optional visa', async () => {
    mount(); const user=userEvent.setup(); await user.click(screen.getByRole('button',{name:/Nouvelle liste/}));
    await user.selectOptions(screen.getByLabelText('Durée commune'),'9');
    await user.type(screen.getByPlaceholderText('Ex. VISA-2026-001'),'V-42');
    await user.click(screen.getByRole('button',{name:'Créer la liste'}));
    expect(mocks.mutate).toHaveBeenCalledWith({action:'create',durationMonths:9,visaNumber:'V-42'});
  });
  it('requires an explicit sealing confirmation carrying the current version', async () => {
    mount(); const user=userEvent.setup(); await user.click(screen.getByRole('button',{name:'Sceller la liste'}));
    expect(mocks.mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Confirmer'}));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'seal',listId:'l1',version:4}));
  });
  it('requires an admin reopening reason and renders the green sealed badge', async () => {
    mocks.lists[0].sealedAt='2026-09-20T10:00:00Z'; mount(); const user=userEvent.setup();
    expect(screen.getAllByText('Scellée')[0]).toHaveClass('list-sealed');
    expect(screen.queryByRole('button',{name:'Ajouter des contrats'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Rouvrir la liste'}));
    expect(screen.getByRole('button',{name:'Confirmer'})).toBeDisabled();
    await user.type(screen.getByLabelText('Motif de réouverture'),'Corriger le visa');
    await user.click(screen.getByRole('button',{name:'Confirmer'}));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'reopen',reason:'Corriger le visa'}));
  });
  it('requires saving an edited visa before sealing', async () => {
    mount(); const user=userEvent.setup();
    await user.type(screen.getByLabelText(/Numéro de visa/),'V-NEW');
    expect(screen.getByRole('button',{name:'Sceller la liste'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Exporter en Excel'})).toBeEnabled();
    expect(screen.getByRole('button',{name:'Enregistrer le visa'})).toBeEnabled();
  });
  it('keeps the confirmed version if another user changes the lot during confirmation', async () => {
    const view=mount(); const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Sceller la liste'}));
    mocks.lists=[{...mocks.lists[0],version:5}];
    view.rerender(<MemoryRouter initialEntries={['/app/listes?liste=l1']}><ListsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button',{name:'Confirmer'}));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({version:4}));
  });
  it('keeps readers read-only', () => {
    mocks.role='reader'; mount();
    expect(screen.queryByRole('button',{name:/Nouvelle liste/})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Ajouter des contrats'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Exporter en Excel'})).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Numéro de visa/)).toBeDisabled();
  });
  it('exports sealed lists without reopening them', async () => {
    mocks.lists[0].sealedAt='2026-09-20T10:00:00Z'; mount();
    await userEvent.setup().click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(mocks.exportExcel).toHaveBeenCalledOnce(); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('disables export for empty lists', () => {
    mocks.lists[0].members=[]; mount();
    expect(screen.getByRole('button',{name:'Exporter en Excel'})).toBeDisabled();
  });
  it('shows export failures and allows retry', async () => {
    mocks.exportExcel.mockRejectedValueOnce(new Error('La liste a changé pendant l’export.'));
    mount(); const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('La liste a changé pendant l’export.');
    await user.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(mocks.exportExcel).toHaveBeenCalledTimes(2); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
