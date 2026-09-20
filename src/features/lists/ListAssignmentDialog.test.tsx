import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListAssignmentDialog } from "./ListAssignmentDialog";
import type { ContractList } from "./listModel";
const mocks=vi.hoisted(()=>({
  contracts:[{id:'c1',firstName:'Louvens',lastName:'LOUIS',nif:'111',salaryNumber:100,durationMonths:6},{id:'c2',firstName:'Ana',lastName:'ÉTIENNE',nif:'222',salaryNumber:200,durationMonths:6}],
  lists:[] as ContractList[], mutate:vi.fn(), close:vi.fn()
}));
vi.mock('../auth/auth',()=>({useAuth:()=>({user:{workspaceId:'w'}})}));
vi.mock('../contracts/contractsApi',()=>({useContractsByIds:()=>({data:mocks.contracts,isPending:false,isError:false})}));
vi.mock('./listsApi',()=>({useContractLists:()=>({data:mocks.lists,isPending:false,isError:false}),useListOperation:()=>({mutateAsync:mocks.mutate,isPending:false,error:null,reset:vi.fn()})}));
beforeEach(()=>{
  cleanup(); mocks.lists=[]; mocks.contracts[1].durationMonths=6; mocks.close.mockReset(); mocks.mutate.mockReset().mockResolvedValue('new');
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
});
describe('selection list dialog',()=>{
  it('reports unavailable selected contracts instead of waiting indefinitely',()=>{
    render(<ListAssignmentDialog contractIds={['c1','c2','missing']} initialMode="create" onClose={mocks.close}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('ne sont plus disponibles');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Créer et attribuer'})).toBeDisabled();
  });
  it('previews and creates one populated lot without leaving the contracts page',async()=>{
    render(<ListAssignmentDialog contractIds={['c1','c2']} initialMode="create" onClose={mocks.close}/>);
    expect(screen.getByText('LOT-2-ÉTIENNE-Ana')).toBeInTheDocument();
    expect(screen.getByText('1,800.00 HTG sur 6 mois')).toBeInTheDocument();
    const user=userEvent.setup(); await user.type(screen.getByLabelText(/Numéro de visa/),'V-TEST');
    await user.click(screen.getByRole('button',{name:'Créer et attribuer'}));
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({action:'create',durationMonths:6,visaNumber:'V-TEST',contractIds:['c1','c2']});
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('offers creation when no existing lot matches',async()=>{
    render(<ListAssignmentDialog contractIds={['c1','c2']} onClose={mocks.close}/>);
    await userEvent.click(screen.getByRole('button',{name:'Créer une liste avec cette sélection'}));
    expect(screen.getByRole('button',{name:'Créer et attribuer'})).toBeEnabled();
  });
  it('blocks mixed-duration creation but permits removing from current lists',async()=>{
    mocks.contracts[1].durationMonths=12;
    render(<ListAssignmentDialog contractIds={['c1','c2']} initialMode="create" onClose={mocks.close}/>);
    expect(screen.getByRole('button',{name:'Créer et attribuer'})).toBeDisabled();
    const user=userEvent.setup(); await user.click(screen.getByRole('button',{name:'Liste existante'}));
    await user.selectOptions(screen.getByLabelText('Liste de destination'),'');
    expect(screen.getByRole('button',{name:'Retirer de la liste'})).toBeEnabled();
  });
  it('blocks creation from a sealed source and keeps the dialog open on server failure',async()=>{
    mocks.lists=[{id:'l',sealedAt:'2026-09-20',members:[{id:'c1'}]} as ContractList];
    const view=render(<ListAssignmentDialog contractIds={['c1','c2']} initialMode="create" onClose={mocks.close}/>);
    expect(screen.getByRole('button',{name:'Créer et attribuer'})).toBeDisabled();
    mocks.lists=[]; mocks.mutate.mockRejectedValue(new Error('Conflict'));
    view.rerender(<ListAssignmentDialog contractIds={['c1','c2']} initialMode="create" onClose={mocks.close}/>);
    await userEvent.click(screen.getByRole('button',{name:'Créer et attribuer'}));
    expect(mocks.close).not.toHaveBeenCalled();
  });
});
