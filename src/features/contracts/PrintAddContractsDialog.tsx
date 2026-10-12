import { useMemo, useState } from "react";
import type { Contract } from "../../data/types";
import { formatFirstName, formatLastName } from "../../lib/format";
import { useContractsList } from "./contractsApi";
import { useContractLists } from "../lists/listsApi";
import { ListDialog, ListIcon } from "../lists/ListDialog";
import { rankPrintCandidates } from "./printContractSuggestions";
import "../lists/lists.css";

export function PrintAddContractsDialog({ workspaceId, contracts, onAdd, onClose }: {
  workspaceId: string;
  contracts: Contract[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const available = useContractsList({ workspaceId, all: true, sort: "name_asc" }, { enabled: Boolean(workspaceId) });
  const lists = useContractLists();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(50);
  const ranked = useMemo(() => rankPrintCandidates(available.data?.items ?? [], contracts, lists.data ?? [], workspaceId), [available.data, contracts, lists.data, workspaceId]);
  const candidates = useMemo(() => search.trim()
    ? rankPrintCandidates(ranked, contracts, lists.data ?? [], workspaceId, search)
    : ranked, [ranked, contracts, lists.data, workspaceId, search]);
  const selectedIds = ranked.filter(contract => selected.has(contract.id)).map(contract => contract.id);
  const ready = Boolean(available.data) && !available.isPlaceholderData && !available.isError && (!lists.isPending || lists.isError);
  return <ListDialog title="Ajouter des contrats" wide onClose={onClose}>
    <div className="lists-dialog-body print-add-body">
      <div className="lists-search"><ListIcon name="search" /><input type="search" data-autofocus aria-label="Rechercher des contrats à imprimer" placeholder="Nom, NIF, poste, affectation…" value={search} onChange={event => { setSearch(event.target.value); setLimit(50); }} /></div>
      {available.isError ? <p className="lists-error" role="alert">Impossible de charger les contrats. <button onClick={() => void available.refetch()}>Réessayer</button></p>
        : !ready ? <p role="status">Chargement des contrats…</p>
        : <div className="lists-candidates print-add-candidates">
          {candidates.slice(0, limit).map(contract => {
            const name = `${formatFirstName(contract.firstName)} ${formatLastName(contract.lastName)}`.trim() || contract.nif || contract.id;
            return <label className="lists-candidate" key={contract.id}>
              <input type="checkbox" aria-label={name} checked={selected.has(contract.id)} onChange={event => {
                const checked = event.target.checked;
                setSelected(previous => { const next = new Set(previous); if (checked) next.add(contract.id); else next.delete(contract.id); return next; });
              }} />
              <span><strong>{name}</strong><small>{[contract.nif, contract.position, contract.assignment].filter(Boolean).join(" · ")}</small></span>
              <b>{contract.durationMonths} mois</b>
            </label>;
          })}
          {!candidates.length && <p className="lists-empty">Aucun contrat trouvé.</p>}
          {candidates.length > limit && <button className="btn btn-outline" onClick={() => setLimit(value => value + 50)}>Afficher plus</button>}
        </div>}
      {lists.isError && <p className="lists-error" role="alert">Listes indisponibles. <button onClick={() => void lists.refetch()}>Réessayer</button></p>}
    </div>
    <footer className="lists-dialog-footer"><span>{selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""}</span><button className="btn btn-outline" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!ready || !selectedIds.length} onClick={() => onAdd(selectedIds)}>Ajouter{selectedIds.length ? ` (${selectedIds.length})` : ""}</button></footer>
  </ListDialog>;
}
