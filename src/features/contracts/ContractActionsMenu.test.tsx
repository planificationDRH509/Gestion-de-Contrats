import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractActionsMenu, contractContextTargets } from "./ContractActionsMenu";
afterEach(cleanup);
function setup(count=3,can=()=>true){
 const props={count,can,expanded:false,onClose:vi.fn(),onDetails:vi.fn(),onList:vi.fn(),onDossiers:vi.fn(),onNewDossier:vi.fn(),onRemoveDossier:vi.fn(),onStatus:vi.fn(),onTags:vi.fn(),onLetter:vi.fn(),onDelete:vi.fn(),onPrint:vi.fn()};
 render(<ContractActionsMenu {...props}/>); return props;
}
describe('contract selection context menu',()=>{
 it('keeps selected cards together and unselected cards independent',()=>{
   expect(contractContextTargets('a',['a','b'],true)).toEqual(['a','b']);
   expect(contractContextTargets('c',['a','b'],false)).toEqual(['c']);
 });
 it('offers existing and new lists with a clear selection count',async()=>{
   const props=setup(); expect(screen.getByText('3 contrats sélectionnés')).toBeInTheDocument();
   await userEvent.click(screen.getByRole('menuitem',{name:'Attribuer à une liste…'})); expect(props.onList).toHaveBeenCalledWith('assign');
   await userEvent.click(screen.getByRole('menuitem',{name:'Créer une liste avec la sélection…'})); expect(props.onList).toHaveBeenCalledWith('create');
   expect(screen.queryByRole('menuitem',{name:'Supprimer le contrat…'})).not.toBeInTheDocument();
   expect(screen.queryByRole('menuitem',{name:'Lettre d’affectation'})).not.toBeInTheDocument();
 });
 it('respects read-only permissions',()=>{
   setup(1,()=>false);
   expect(screen.queryByRole('group',{name:'Listes'})).not.toBeInTheDocument();
   expect(screen.queryByRole('group',{name:'Dossiers'})).not.toBeInTheDocument();
   expect(screen.queryByRole('group',{name:'Suivi'})).not.toBeInTheDocument();
   expect(screen.getByRole('menuitem',{name:'Afficher les informations'})).toBeInTheDocument();
 });
});
