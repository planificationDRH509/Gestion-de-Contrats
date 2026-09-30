import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/auth";
import { useContractsList } from "../contracts/contractsApi";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";
import { formatCurrency, formatFirstName, formatLastName } from "../../lib/format";
import { useContractLists, useListOperation } from "./listsApi";
import { listError, normalizeListSearch, type ContractList } from "./listModel";
import { ListDialog, ListIcon } from "./ListDialog";

export function ListAddContractsDialog({ list, onClose, onAdded }: { list: ContractList; onClose: () => void; onAdded: () => void }) {
  const { user, can } = useAuth();
  const isMobile = useIsMobileViewport();
  const operation = useListOperation();
  const lists = useContractLists();
  const contracts = useContractsList({ workspaceId: user?.workspaceId ?? "", all: true, sort: "name_asc" });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const membership = useMemo(() => new Set((lists.data ?? []).flatMap(item => item.members.map(member => member.id))), [lists.data]);
  const available = (contracts.data?.items ?? []).filter(contract => contract.durationMonths === list.durationMonths && !membership.has(contract.id));
  const candidates = available.filter(contract => normalizeListSearch(`${contract.lastName} ${contract.firstName} ${contract.nif} ${contract.position}`).includes(normalizeListSearch(search.trim())));
  const availableIds = new Set(available.map(contract => contract.id));
  const selectedIds = selected.filter(id => availableIds.has(id));
  const allChecked = candidates.length > 0 && candidates.every(contract => selectedIds.includes(contract.id));
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = !allChecked && candidates.some(contract => selectedIds.includes(contract.id)); }, [allChecked, candidates, selectedIds]);
  const ready = !contracts.isPending && !contracts.isError && !contracts.isPlaceholderData && !lists.isPending && !lists.isError;
  return <ListDialog title={`Ajouter des contrats · ${list.durationMonths} mois`} wide busy={operation.isPending} onClose={onClose}>
    <div className="lists-dialog-body lists-add-body">
      <div className="lists-search"><ListIcon name="search" /><input type="search" data-autofocus aria-label="Rechercher des contrats à ajouter" placeholder="Nom, NIF ou titre…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      {contracts.isError || lists.isError ? <p className="lists-error" role="alert">{listError(contracts.error ?? lists.error)} <button onClick={() => { void contracts.refetch(); void lists.refetch(); }}>Réessayer</button></p> : !ready ? <p role="status">Chargement des contrats…</p> : <>
        <label className="lists-add-select-all"><input ref={checkbox} type="checkbox" checked={allChecked} disabled={operation.isPending} onChange={event => setSelected(ids => event.target.checked ? [...new Set([...ids, ...candidates.map(contract => contract.id)])] : ids.filter(id => !candidates.some(contract => contract.id === id)))} />Tout sélectionner <span>{candidates.length}</span></label>
        <div className="lists-candidates">{candidates.map(contract => <label className="lists-candidate" key={contract.id}><input type="checkbox" checked={selectedIds.includes(contract.id)} disabled={operation.isPending} onChange={event => setSelected(ids => event.target.checked ? [...ids, contract.id] : ids.filter(id => id !== contract.id))} /><span><strong>{formatLastName(contract.lastName)} {formatFirstName(contract.firstName)}</strong><small>{contract.nif} · {contract.position}</small></span><b>{formatCurrency(contract.salaryNumber)} HTG</b></label>)}</div>
        {!candidates.length && <p className="lists-empty">Aucun contrat disponible</p>}
      </>}
      {operation.error && <p className="lists-error" role="alert">{listError(operation.error)}</p>}
    </div>
    <footer className="lists-dialog-footer"><span>{selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""}</span><button className="btn btn-outline" onClick={onClose} disabled={operation.isPending}>Annuler</button><button className="btn btn-primary" disabled={!ready || !selectedIds.length || operation.isPending} onClick={async () => {
      if (!ready || isMobile || !can("contracts.edit") || list.sealedAt || operation.isPending) return;
      try { await operation.mutateAsync({ action: "assign", listId: list.id, version: list.version, contractIds: selectedIds }); onAdded(); } catch { /* mutation error above */ }
    }}>{operation.isPending ? "Ajout…" : `Ajouter ${selectedIds.length} contrat${selectedIds.length > 1 ? "s" : ""}`}</button></footer>
  </ListDialog>;
}
