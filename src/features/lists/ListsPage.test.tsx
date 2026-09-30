import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ContractList } from "./listModel";
import { ListsPage } from "./ListsPage";
const mocks = vi.hoisted(() => ({
  role: 'admin', mobile: false, lists: [] as ContractList[], candidates: [] as object[],
  mutate: vi.fn(), exportExcel: vi.fn(), grid: vi.fn(), error: null as Error | null
}));
vi.mock('../auth/auth', () => ({ useAuth: () => ({user: { id:'u',workspaceId:'w',role:mocks.role },can: () => mocks.role !== 'reader'}) }));
vi.mock('../../lib/useIsMobileViewport', () => ({ useIsMobileViewport: () => mocks.mobile }));
vi.mock('./listsApi', () => ({useContractLists: () => ({data:mocks.lists,isPending:false,error:null,refetch:vi.fn().mockResolvedValue({data:mocks.lists})}),useListOperation: () => ({mutateAsync:mocks.mutate,isPending:false,error:mocks.error})}));
vi.mock('../contracts/contractsApi', () => ({useContractsList: () => ({data:{items:mocks.candidates},isPending:false})}));
vi.mock('../salary-grid/salaryGridApi', () => ({useSalaryGrid: () => ({data:[],refetch:mocks.grid})}));
vi.mock('./ListAssignmentDialog', () => ({ListAssignmentDialog: () => <div role="dialog" aria-label="Déplacement" /> }));
vi.mock('./downloadListExcel', () => ({downloadListExcel: mocks.exportExcel}));
function mount(path = '/app/listes?liste=l1') { return render(<MemoryRouter initialEntries={[path]}><ListsPage /></MemoryRouter>); }
beforeEach(() => {
  cleanup(); mocks.role='admin'; mocks.mobile=false; mocks.candidates=[]; mocks.error=null;
  mocks.mutate.mockReset().mockResolvedValue('new-list'); mocks.grid.mockReset().mockResolvedValue({data:[]});
  mocks.exportExcel.mockReset().mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  mocks.lists=[{id:'l1',workspaceId:'w',durationMonths:6,visaNumber:null,sealedAt:null,version:4,createdAt:'2026-09-20T00:00:00Z',history:[],members:[
    {id:'c1',firstName:'Louvens',lastName:'Louis',nif:'111',salaryNumber:100,durationMonths:6,position:'Infirmier'},
    {id:'c2',firstName:'Ana',lastName:'Étienne',nif:'222',salaryNumber:200,durationMonths:6,position:'Médecin'}
  ]}];
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('ListsPage', () => {
  it('selects the latest list on desktop and shows alphabetical members and duration totals', () => {
    mount('/app/listes');
    expect(screen.getByRole('heading',{name:'LOT-2-ÉTIENNE-Ana'})).toBeInTheDocument();
    const rows=within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('ÉTIENNE Ana'); expect(rows[2]).toHaveTextContent('LOUIS Louvens');
    expect(screen.getByText('Montant total').parentElement).toHaveTextContent('1,800.00 HTG');
    expect(screen.queryByText('Scellée')).not.toBeInTheDocument();
  });
  it('filters lists by member, visa, state and duration with accent-insensitive search', async () => {
    mocks.lists.push({...mocks.lists[0],id:'l2',durationMonths:9,visaNumber:'V-NORD',sealedAt:'2026-09-20',members:[]});
    mount('/app/listes');
    await userEvent.type(screen.getByRole('searchbox',{name:'Rechercher une liste'}),'etienne');
    expect(screen.getByRole('heading',{name:'LOT-2-ÉTIENNE-Ana'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/LOT-0/})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Effacer la recherche'}));
    await userEvent.selectOptions(screen.getByLabelText('Durée des listes'),'9');
    expect(screen.getByRole('heading',{name:'LOT-0'})).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group',{name:'État des listes'})).getByRole('button',{name:/En préparation/}));
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Réinitialiser les filtres'}));
    expect(screen.getAllByRole('button',{name:/LOT-/})).toHaveLength(2);
  });
  it('creates a list in a dialog with duration and optional visa', async () => {
    mount(); await userEvent.click(screen.getByRole('button',{name:/Nouvelle liste/}));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Durée commune'),'9');
    await userEvent.type(within(dialog).getByLabelText('Numéro de visa'),'V-42');
    await userEvent.click(within(dialog).getByRole('button',{name:'Créer la liste'}));
    expect(mocks.mutate).toHaveBeenCalledWith({action:'create',durationMonths:9,visaNumber:'V-42'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('requires explicit sealing confirmation with the confirmed version', async () => {
    const view=mount(); await userEvent.click(screen.getByRole('button',{name:'Sceller la liste'}));
    expect(mocks.mutate).not.toHaveBeenCalled();
    mocks.lists=[{...mocks.lists[0],version:5}];
    view.rerender(<MemoryRouter initialEntries={['/app/listes?liste=l1']}><ListsPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button',{name:'Confirmer'}));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'seal',listId:'l1',version:4}));
  });
  it('requires an admin reopening reason and renders the sealed badge', async () => {
    mocks.lists[0].sealedAt='2026-09-20T10:00:00Z'; mount();
    expect(screen.getByText('Scellée')).toHaveClass('list-sealed');
    expect(screen.queryByRole('button',{name:'Ajouter des contrats'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Rouvrir la liste'}));
    expect(screen.getByRole('button',{name:'Confirmer'})).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motif de réouverture'),'Corriger le visa');
    await userEvent.click(screen.getByRole('button',{name:'Confirmer'}));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'reopen',reason:'Corriger le visa'}));
  });
  it('edits the visa in its own dialog and keeps input on failure', async () => {
    mocks.mutate.mockRejectedValueOnce(new Error('La liste a changé.'));
    mount(); await userEvent.click(screen.getByRole('button',{name:'Modifier le visa'}));
    await userEvent.type(screen.getByLabelText('Numéro de visa'),'V-NEW');
    await userEvent.click(screen.getByRole('button',{name:'Enregistrer le visa'}));
    expect(screen.getByRole('alert')).toHaveTextContent('La liste a changé.');
    expect(screen.getByLabelText('Numéro de visa')).toHaveValue('V-NEW');
    await userEvent.click(screen.getByRole('button',{name:'Enregistrer le visa'}));
    expect(mocks.mutate).toHaveBeenLastCalledWith({action:'visa',listId:'l1',version:4,visaNumber:'V-NEW'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('selects only visible members while retaining previous selections, then confirms removal', async () => {
    mount();
    await userEvent.click(screen.getByLabelText('Sélectionner Louvens Louis'));
    await userEvent.type(screen.getByRole('searchbox',{name:'Rechercher dans les contrats du lot'}),'etienne');
    await userEvent.click(screen.getByLabelText('Sélectionner tous les contrats affichés'));
    expect(screen.getByRole('region',{name:'Contrats sélectionnés'})).toHaveTextContent('2 sélectionnés');
    await userEvent.click(screen.getByRole('button',{name:'Retirer'}));
    expect(mocks.mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button',{name:'Confirmer'}));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'assign',listId:null,contractIds:['c1','c2']}));
  });
  it('adds only unassigned contracts of matching duration and retains selection through search', async () => {
    mocks.candidates=[...mocks.lists[0].members,
      {id:'c3',lastName:'Jean',firstName:'Marie',nif:'333',durationMonths:6,position:'Infirmière',salaryNumber:100},
      {id:'c4',lastName:'Pierre',firstName:'Paul',nif:'444',durationMonths:6,position:'Médecin',salaryNumber:200},
      {id:'c5',lastName:'Excluded',firstName:'Test',nif:'555',durationMonths:9,position:'Agent',salaryNumber:100}];
    mount(); await userEvent.click(screen.getByRole('button',{name:'Ajouter des contrats'}));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByText(/Excluded/)).not.toBeInTheDocument();
    expect(dialog.queryByText('LOUIS Louvens')).not.toBeInTheDocument();
    await userEvent.type(dialog.getByRole('searchbox'),'Marie');
    await userEvent.click(dialog.getByLabelText(/Tout sélectionner/));
    await userEvent.clear(dialog.getByRole('searchbox'));
    await userEvent.type(dialog.getByRole('searchbox'),'Paul');
    await userEvent.click(dialog.getByLabelText(/Tout sélectionner/));
    await userEvent.click(dialog.getByRole('button',{name:'Ajouter 2 contrats'}));
    expect(mocks.mutate).toHaveBeenCalledWith({action:'assign',listId:'l1',version:4,contractIds:['c3','c4']});
  });
  it('keeps readers read-only according to their existing permissions', () => {
    mocks.role='reader'; mount();
    expect(screen.queryByRole('button',{name:/Nouvelle liste|Ajouter des contrats|Modifier le visa|Exporter en Excel|Sceller la liste/})).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('lets mobile users only browse and export, including when they are administrators', async () => {
    mocks.mobile=true; mount('/app/listes');
    expect(screen.queryByRole('heading',{name:'LOT-2-ÉTIENNE-Ana'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:/LOT-2-ÉTIENNE-Ana/}));
    expect(screen.getByRole('heading',{name:'LOT-2-ÉTIENNE-Ana'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Nouvelle liste|Ajouter des contrats|Modifier le visa|Sceller la liste|Retirer|Changer de liste/})).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(mocks.exportExcel).toHaveBeenCalledWith(expect.any(Function), []);
    expect(mocks.mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button',{name:'Toutes les listes'}));
    expect(screen.queryByRole('heading',{name:'LOT-2-ÉTIENNE-Ana'})).not.toBeInTheDocument();
  });
  it('removes management dialogs when switching to mobile and hides reopening and deletion', async () => {
    const view=mount(); await userEvent.click(screen.getByRole('button',{name:'Modifier le visa'}));
    mocks.mobile=true;
    view.rerender(<MemoryRouter initialEntries={['/app/listes?liste=l1']}><ListsPage /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mocks.lists=[{...mocks.lists[0],sealedAt:'2026-09-20'}];
    view.rerender(<MemoryRouter initialEntries={['/app/listes?liste=l1']}><ListsPage /></MemoryRouter>);
    expect(screen.queryByRole('button',{name:'Rouvrir la liste'})).not.toBeInTheDocument();
    mocks.lists=[{...mocks.lists[0],sealedAt:null,members:[]}];
    view.rerender(<MemoryRouter initialEntries={['/app/listes?liste=l1']}><ListsPage /></MemoryRouter>);
    expect(screen.queryByRole('button',{name:'Supprimer la liste vide'})).not.toBeInTheDocument();
  });
  it('exports sealed lists without reopening and leaves export disabled for empty lists', async () => {
    mocks.lists[0].sealedAt='2026-09-20T10:00:00Z'; const view=mount();
    await userEvent.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(mocks.exportExcel).toHaveBeenCalledOnce(); expect(mocks.mutate).not.toHaveBeenCalled();
    mocks.lists=[{...mocks.lists[0],members:[]}];
    view.rerender(<MemoryRouter initialEntries={['/app/listes?liste=l1']}><ListsPage /></MemoryRouter>);
    expect(screen.getByRole('button',{name:'Exporter en Excel'})).toBeDisabled();
  });
  it('shows export errors and retries, but never treats unavailable reference data as absent titles', async () => {
    mocks.grid.mockResolvedValueOnce({error:new Error('Grille indisponible')});
    mount(); await userEvent.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Grille indisponible'); expect(mocks.exportExcel).not.toHaveBeenCalled();
    mocks.exportExcel.mockRejectedValueOnce(new Error('La liste a changé pendant l’export.'));
    await userEvent.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('La liste a changé pendant l’export.');
    await userEvent.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(mocks.exportExcel).toHaveBeenCalledTimes(2); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('uses the available reference data for offline export', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); mount();
    await userEvent.click(screen.getByRole('button',{name:'Exporter en Excel'}));
    expect(mocks.grid).not.toHaveBeenCalled(); expect(mocks.exportExcel).toHaveBeenCalledWith(expect.any(Function), []);
  });
});
