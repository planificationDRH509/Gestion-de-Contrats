import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { formatCurrency } from "../../lib/format";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";
import { useContractLists, useListOperation } from "./listsApi";
import { listError, listName, listTotals, normalizeListSearch, type ContractList } from "./listModel";
import { ListDialog, ListIcon } from "./ListDialog";
import { ListDetail } from "./ListDetail";
import "./lists.css";

export function ListsPage() {
  const { can } = useAuth();
  const isMobile = useIsMobileViewport();
  const canManage = can("contracts.edit") && !isMobile;
  const query = useContractLists();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "sealed">("all");
  const [duration, setDuration] = useState("");
  const [creating, setCreating] = useState(false);
  const lists = query.data ?? [];
  const selectedId = params.get("liste");
  const filtered = lists.filter(list => (filter === "all" || Boolean(list.sealedAt) === (filter === "sealed"))
    && (!duration || list.durationMonths === Number(duration))
    && normalizeListSearch(`${listName(list)} ${list.id} ${list.visaNumber ?? ""} ${list.members.map(member => `${member.lastName} ${member.firstName} ${member.nif}`).join(" ")}`)
      .includes(normalizeListSearch(search.trim())))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const selected = selectedId ? lists.find(list => list.id === selectedId) : !isMobile ? filtered[0] : undefined;
  function selectList(id?: string) {
    setParams(previous => { const next = new URLSearchParams(previous); if (id) next.set("liste", id); else next.delete("liste"); return next; });
  }
  function resetFilters() { setSearch(""); setFilter("all"); setDuration(""); selectList(); }
  const showBrowser = !isMobile || !selectedId;

  return <div className="page-container lists-hub">
    <header className="lists-page-heading"><div><h1>Listes</h1><span>{lists.length}</span></div>
      {canManage && <button className="btn btn-primary" onClick={() => setCreating(true)}><ListIcon name="add" />Nouvelle liste</button>}
    </header>
    {query.error && <div className="lists-error" role="alert">{listError(query.error)} <button onClick={() => void query.refetch()}>Réessayer</button></div>}
    <div className={`lists-layout${!showBrowser ? " lists-layout-detail" : ""}`}>
      {showBrowser && <aside className="lists-browser" aria-label="Toutes les listes">
        <div className="lists-browser-controls">
          <div className="lists-search"><ListIcon name="search" /><input type="search" aria-label="Rechercher une liste" placeholder="Nom, visa, personne, NIF…" value={search} onChange={event => { setSearch(event.target.value); selectList(); }} />
            {search && <button className="lists-icon-button" aria-label="Effacer la recherche" onClick={() => { setSearch(""); selectList(); }}><ListIcon name="close" /></button>}
          </div>
          <div className="lists-status-tabs" role="group" aria-label="État des listes">
            {([{ value: "all", label: "Toutes", count: lists.length }, { value: "open", label: "En préparation", count: lists.filter(list => !list.sealedAt).length }, { value: "sealed", label: "Scellées", count: lists.filter(list => list.sealedAt).length }] as const).map(item =>
              <button key={item.value} aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); selectList(); }}>{item.label}<span>{item.count}</span></button>)}
          </div>
          <div className="lists-browser-filter"><span>{filtered.length} liste{filtered.length > 1 ? "s" : ""}</span>
            <select className="select" aria-label="Durée des listes" value={duration} onChange={event => { setDuration(event.target.value); selectList(); }}>
              <option value="">Toutes les durées</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} mois</option>)}
            </select>
          </div>
        </div>
        <div className="lists-browser-items" aria-busy={query.isPending}>
          {query.isPending ? <p className="lists-empty" role="status">Chargement des listes…</p> : !filtered.length ? <div className="lists-empty"><ListIcon name="inventory_2" /><h2>{lists.length ? "Aucun résultat" : "Aucune liste"}</h2>
            {lists.length > 0 && <button className="btn btn-outline" onClick={resetFilters}>Réinitialiser les filtres</button>}
          </div> : filtered.map(list => <ListSummary key={list.id} list={list} active={selected?.id === list.id} onClick={() => selectList(list.id)} />)}
        </div>
      </aside>}
      {selected ? <ListDetail key={selected.id} list={selected} onBack={() => selectList()} onDeleted={() => selectList()} />
        : (!isMobile || selectedId) && <section className="lists-detail-empty"><ListIcon name="format_list_bulleted" /><h2>{selectedId && !query.isPending ? "Liste introuvable" : query.isPending ? "Chargement…" : "Aucune liste sélectionnée"}</h2>
          {selectedId && <button className="btn btn-outline" onClick={() => selectList()}>Retour aux listes</button>}
        </section>}
    </div>
    {creating && canManage && <CreateListDialog onClose={() => setCreating(false)} onCreated={id => { resetFilters(); selectList(id); setCreating(false); }} />}
  </div>;
}

function ListSummary({ list, active, onClick }: { list: ContractList; active: boolean; onClick: () => void }) {
  return <button className={`lists-summary${active ? " is-selected" : ""}`} aria-current={active ? "true" : undefined} onClick={onClick}>
    <div className="lists-summary-top"><span className="lists-summary-symbol"><ListIcon name={list.sealedAt ? "lock" : "inventory_2"} /></span>
      <strong>{listName(list)}</strong>{list.sealedAt && <span className="lists-sealed-dot" title="Scellée" aria-label="Scellée" />}
    </div>
    <div className="lists-summary-meta"><span>{list.members.length} contrat{list.members.length > 1 ? "s" : ""}</span><span>{list.durationMonths} mois</span><strong>{formatCurrency(listTotals(list).total)} HTG</strong></div>
    <div className="lists-summary-reference"><span>{list.visaNumber ? `Visa ${list.visaNumber}` : `Réf. ${list.id.slice(0, 8)}`}</span><ListIcon name="chevron_right" /></div>
  </button>;
}

function CreateListDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useListOperation();
  const { can } = useAuth();
  const isMobile = useIsMobileViewport();
  const [duration, setDuration] = useState(12);
  const [visa, setVisa] = useState("");
  return <ListDialog title="Nouvelle liste" busy={operation.isPending} onClose={onClose}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (isMobile || !can("contracts.edit") || operation.isPending) return;
      try { const id = await operation.mutateAsync({ action: "create", durationMonths: duration, visaNumber: visa.trim() }); if (id) onCreated(id); } catch { /* mutation error below */ }
    }}>
      <div className="lists-dialog-body lists-create-fields">
        <label className="lists-field">Durée commune<select className="select" data-autofocus value={duration} disabled={operation.isPending} onChange={event => setDuration(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} mois</option>)}</select></label>
        <label className="lists-field">Numéro de visa<input className="input" maxLength={120} value={visa} disabled={operation.isPending} onChange={event => setVisa(event.target.value)} placeholder="Ex. VISA-2026-001" /></label>
        {operation.error && <p className="lists-error" role="alert">{listError(operation.error)}</p>}
      </div>
      <footer className="lists-dialog-footer"><button type="button" className="btn btn-outline" onClick={onClose} disabled={operation.isPending}>Annuler</button><button className="btn btn-primary" disabled={operation.isPending}>{operation.isPending ? "Création…" : "Créer la liste"}</button></footer>
    </form>
  </ListDialog>;
}
