import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { useContractsList } from "../contracts/contractsApi";
import { formatCurrency, formatFirstName, formatLastName } from "../../lib/format";
import { useContractLists, useListOperation } from "./listsApi";
import { listError, listName, listTotals, sortedMembers, type ContractList, type ListOperation } from "./listModel";
import { ListAssignmentDialog } from "./ListAssignmentDialog";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";

const historyLabels: Record<string, string> = { create: "Création", assign: "Composition modifiée", visa: "Visa modifié", seal: "Scellement", reopen: "Réouverture" };
export function ListsPage() {
  const { can } = useAuth();
  const offline = import.meta.env.VITE_DATA_PROVIDER === "supabase" && !navigator.onLine;
  const query = useContractLists();
  const operation = useListOperation();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [duration, setDuration] = useState(12);
  const [visa, setVisa] = useState("");
  const lists = query.data ?? [];
  const selectedId = params.get("liste");
  const selected = lists.find(l => l.id === selectedId);
  const filtered = lists.filter(l => (filter === "all" || Boolean(l.sealedAt) === (filter === "sealed")) &&
    `${listName(l)} ${l.visaNumber ?? ""} ${l.members.map(m => `${m.lastName} ${m.firstName} ${m.nif}`).join(" ")}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
  return <div className="page-container lists-page">
    <div className="section-header page-header">
      <div><span className="page-eyebrow">Acheminement des contrats</span><h1 className="section-title">Listes</h1>
        <p className="section-subtitle">Composez vos lots par durée, puis scellez-les pour l’acheminement.</p></div>
      {can("contracts.edit") && <button className="btn btn-primary" onClick={() => setCreating(!creating)}><span className="material-symbols-rounded">playlist_add</span>Nouvelle liste</button>}
    </div>
    <div className="list-overview">
      <div><strong>{lists.length}</strong><span>listes</span></div>
      <div><strong>{lists.filter(l => !l.sealedAt).length}</strong><span>en préparation</span></div>
      <div><strong>{lists.filter(l => l.sealedAt).length}</strong><span>scellées</span></div>
      <div><strong>{lists.reduce((s, l) => s + l.members.length, 0)}</strong><span>contrats regroupés</span></div>
    </div>
    {creating && <form className="card list-create" onSubmit={async e => {
      e.preventDefault();
      try {
        const id = await operation.mutateAsync({ action: "create", durationMonths: duration, visaNumber: visa });
        if (id) setParams({ liste: id }); setCreating(false); setVisa("");
      } catch { /* displayed below */ }
    }}>
      <label className="list-field">Durée commune<select className="select" value={duration} onChange={e => setDuration(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} mois</option>)}</select></label>
      <label className="list-field">Numéro de visa <small>facultatif</small><input className="input" maxLength={120} value={visa} onChange={e => setVisa(e.target.value)} placeholder="Ex. VISA-2026-001" /></label>
      <button className="btn btn-primary" disabled={operation.isPending}>Créer la liste</button>
      <button className="btn btn-outline" type="button" onClick={() => setCreating(false)} disabled={operation.isPending}>Annuler</button>
    </form>}
    {(query.error || operation.error) && <div className="list-error" role="alert">{listError(operation.error ?? query.error)} <button className="btn btn-outline" onClick={() => void query.refetch()}>Actualiser</button></div>}
    <div className="list-workspace">
      <section className="list-browser" aria-label="Toutes les listes">
        <label className="list-field"><input aria-label="Rechercher une liste" className="input" placeholder="Nom, visa, personne, NIF…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <select className="select" aria-label="État des listes" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Toutes les listes</option><option value="open">En préparation</option><option value="sealed">Scellées</option></select>
        {query.isPending ? <p>Chargement des listes…</p> : filtered.length === 0 ? <div className="card list-empty"><span className="material-symbols-rounded">inventory_2</span><p>{lists.length ? "Aucune liste ne correspond à la recherche." : offline ? "Aucune liste disponible hors ligne." : "Créez votre première liste, puis ajoutez des contrats de même durée."}</p></div> : filtered.map(l => <button key={l.id} className={`list-summary ${selectedId === l.id ? "is-selected" : ""}`} onClick={() => setParams({ liste: l.id })}>
          <span className="list-summary-top"><span className="material-symbols-rounded">{l.sealedAt ? "lock" : "inventory_2"}</span>{l.sealedAt && <span className="badge list-sealed">Scellée</span>}</span>
          <strong>{listName(l)}</strong><span>{l.members.length} contrat(s) · {l.durationMonths} mois</span>
          <b>{formatCurrency(listTotals(l).total)} HTG</b>
          <small>{l.visaNumber ? `Visa : ${l.visaNumber}` : "Sans numéro de visa"} · Réf. {l.id.slice(0, 8)}</small>
        </button>)}
      </section>
      {selected ? <ListDetail key={selected.id} list={selected} onDeleted={() => setParams({})} /> : <section className="card list-empty"><span className="material-symbols-rounded">format_list_bulleted</span><h2>{selectedId && !query.isPending ? "Liste introuvable" : "Vos lots, prêts à être acheminés"}</h2><p>Sélectionnez une liste pour consulter ses contrats, son montant et son visa.</p></section>}
    </div>
  </div>;
}

function ListDetail({ list, onDeleted }: { list: ContractList; onDeleted: () => void }) {
  const { user, can } = useAuth();
  const isMobile = useIsMobileViewport();
  const operation = useListOperation();
  const [visa, setVisa] = useState(list.visaNumber ?? "");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [addingIds, setAddingIds] = useState<string[]>([]);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<"seal" | "reopen" | "delete" | "remove" | null>(null);
  const [confirmedVersion, setConfirmedVersion] = useState(list.version);
  function ask(action: "seal" | "reopen" | "delete" | "remove") {
    setConfirmedVersion(list.version);
    setConfirm(action);
  }
  const [reason, setReason] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const query = useContractLists();
  const contracts = useContractsList({ workspaceId: user?.workspaceId ?? "", all: true, sort: "name_asc" }, { enabled: adding });
  const membership = useMemo(() => new Map((query.data ?? []).flatMap(l => l.members.map(m => [m.id, l] as const))), [query.data]);
  useEffect(() => { setVisa(list.visaNumber ?? ""); }, [list.visaNumber]);
  useEffect(() => { setSelected(ids => ids.filter(id => list.members.some(m => m.id === id))); }, [list.members]);
  const candidates = (contracts.data?.items ?? []).filter(c => c.durationMonths === list.durationMonths && !membership.has(c.id)
    && `${c.lastName} ${c.firstName} ${c.nif}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
  const members = sortedMembers(list.members);
  const totals = listTotals(list);
  const editable = can("contracts.edit") && !list.sealedAt;
  async function exportExcel() {
    if (exporting || !can("contracts.export")) return;
    setExporting(true); setExportError(null);
    try {
      const { downloadListExcel } = await import("./downloadListExcel");
      await downloadListExcel(async () => {
        const result = await query.refetch();
        if (result.error) throw result.error;
        const current = result.data?.find(item => item.id === list.id && item.workspaceId === user?.workspaceId);
        if (!current) throw new Error("Cette liste n’est plus disponible. Actualisez la page.");
        return current;
      });
    } catch (error) { setExportError(listError(error)); }
    finally { setExporting(false); }
  }
  async function run(input: ListOperation) {
    try {
      await operation.mutateAsync({ listId: list.id, version: list.version, ...input });
      setConfirm(null); setSelected([]); setAddingIds([]); setAdding(false);
      if (input.action === "delete") onDeleted();
    } catch { /* displayed below */ }
  }
  return <section className="card list-detail">
    <header className="list-detail-heading"><div><span className="page-eyebrow">Lot de contrats · {list.durationMonths} mois</span><h2>{listName(list)}</h2></div>{list.sealedAt && <span className="badge list-sealed"><span className="material-symbols-rounded">lock</span>Scellée</span>}</header>
    <div className="list-metrics"><div><span>Contrats</span><strong>{members.length}</strong></div><div><span>Total mensuel</span><strong>{formatCurrency(totals.monthly)} HTG</strong></div><div><span>Montant total · {list.durationMonths} mois</span><strong>{formatCurrency(totals.total)} HTG</strong></div></div>
    <form className="list-visa" onSubmit={e => { e.preventDefault(); void run({ action: "visa", visaNumber: visa }); }}>
      <label className="list-field">Numéro de visa <small>facultatif</small><input className="input" maxLength={120} placeholder="Non renseigné" value={visa} onChange={e => setVisa(e.target.value)} disabled={!editable || operation.isPending} /></label>
      {editable && <button className="btn btn-outline" disabled={operation.isPending || visa === (list.visaNumber ?? "")}>Enregistrer le visa</button>}
    </form>
    {editable && visa !== (list.visaNumber ?? "") && <p className="helper-text">Enregistrez le visa avant de sceller la liste.</p>}
    {list.sealedAt && <p className="list-notice">Scellée le {new Date(list.sealedAt).toLocaleString("fr-FR")}. La composition, le visa et les informations du contrat sont protégés. Un administrateur peut rouvrir la liste avec un motif.</p>}
    <div className="list-actions">
      {can("contracts.export") && <button className="btn btn-outline" onClick={() => void exportExcel()} disabled={exporting || !members.length || operation.isPending}><span className="material-symbols-rounded" aria-hidden="true">download</span>{exporting ? "Export en cours…" : "Exporter en Excel"}</button>}
      {editable && <><button className="btn btn-primary" onClick={() => setAdding(!adding)} disabled={operation.isPending}>Ajouter des contrats</button><button className="btn btn-outline" onClick={() => ask("seal")} disabled={!members.length || operation.isPending || visa !== (list.visaNumber ?? "")}>Sceller la liste</button>{!members.length && <button className="btn btn-outline" onClick={() => ask("delete")} disabled={operation.isPending}>Supprimer la liste vide</button>}</>}
      {list.sealedAt && user?.role === "admin" && <button className="btn btn-outline" onClick={() => ask("reopen")} disabled={operation.isPending}>Rouvrir la liste</button>}
    </div>
    {can("contracts.export") && <p className="helper-text">Format du tableau MSPP. Les champs non renseignés (formation, expérience, tâches, remarques) restent à compléter dans Excel.</p>}
    {exportError && <p role="alert" className="list-error">{exportError}</p>}
    {operation.error && <p role="alert" className="list-error">{listError(operation.error)}</p>}
    {confirm && <div className="list-confirm" role="region" aria-label="Confirmation">
      <strong>{confirm === "seal" ? "Sceller ce lot ?" : confirm === "reopen" ? "Rouvrir ce lot ?" : confirm === "remove" ? `Retirer ${selected.length} contrat(s) de ce lot ?` : "Supprimer cette liste vide ?"}</strong>
      <p>{confirm === "seal" ? `${members.length} contrat(s), ${list.durationMonths} mois, ${formatCurrency(totals.total)} HTG. Toute modification du contenu nécessitera une réouverture.` : confirm === "reopen" ? "Le lot redeviendra modifiable. Le motif et votre nom seront conservés dans son historique." : confirm === "remove" ? "Les contrats resteront disponibles sans liste." : "La liste sera supprimée."}</p>
      {confirm === "reopen" && <label className="list-field">Motif de réouverture<textarea className="textarea" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>}
      <div className="list-actions"><button className="btn btn-outline" onClick={() => setConfirm(null)} disabled={operation.isPending}>Annuler</button><button className="btn btn-primary" disabled={operation.isPending || (confirm === "reopen" && !reason.trim())} onClick={() => void run(confirm === "remove" ? { action: "assign", listId: null, contractIds: selected } : { action: confirm, reason, version: confirmedVersion })}>Confirmer</button></div>
    </div>}
    {adding && editable && <div className="list-add-panel">
      <h3>Contrats disponibles · {list.durationMonths} mois</h3><p className="helper-text">Contrats sans liste. Pour déplacer un contrat déjà attribué, utilisez sa carte ou sa liste actuelle.</p>
      <input className="input" aria-label="Rechercher des contrats à ajouter" placeholder="Nom ou NIF…" value={search} onChange={e => setSearch(e.target.value)} />
      {contracts.isError ? <p className="list-error" role="alert">{listError(contracts.error)}</p> : contracts.isPending ? <p>Chargement…</p> : <>
        <label className="list-check"><input type="checkbox" checked={candidates.length > 0 && candidates.every(c => addingIds.includes(c.id))} onChange={e => setAddingIds(e.target.checked ? candidates.map(c => c.id) : [])} />Tout sélectionner ({candidates.length})</label>
        <div className="list-candidates">{candidates.map(c => <label className="list-candidate" key={c.id}><input type="checkbox" checked={addingIds.includes(c.id)} onChange={e => setAddingIds(ids => e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} /><span><strong>{formatLastName(c.lastName)} {formatFirstName(c.firstName)}</strong><small>{c.nif} · {c.position}</small></span><b>{formatCurrency(c.salaryNumber)} HTG / mois</b></label>)}{!candidates.length && <p>Aucun contrat disponible de cette durée.</p>}</div>
        <button className="btn btn-primary" disabled={!addingIds.length || operation.isPending || contracts.isPlaceholderData || query.isError} onClick={() => void run({ action: "assign", contractIds: addingIds })}>Ajouter {addingIds.length} contrat(s)</button>
      </>}
    </div>}
    <div className="list-members-heading"><h3>Contrats du lot <small>· ordre alphabétique</small></h3>{editable && selected.length > 0 && <div className="list-actions"><button className="btn btn-outline" onClick={() => setMoving(selected)} disabled={operation.isPending}>Changer de liste ({selected.length})</button><button className="btn btn-outline" onClick={() => ask("remove")} disabled={operation.isPending}>Retirer</button></div>}</div>
    <div className="list-table-scroll"><table className="list-table"><thead><tr>{editable && <th><input aria-label="Sélectionner tous les contrats du lot" type="checkbox" checked={members.length > 0 && selected.length === members.length} onChange={e => setSelected(e.target.checked ? members.map(m => m.id) : [])} /></th>}<th>Nom et prénom</th><th>NIF / Poste</th><th>Salaire mensuel</th></tr></thead><tbody>{members.map(m => <tr key={m.id}>{editable && <td><input type="checkbox" aria-label={`Sélectionner ${m.firstName} ${m.lastName}`} checked={selected.includes(m.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id))} /></td>}<td>{isMobile ? <span>{formatLastName(m.lastName)} {formatFirstName(m.firstName)}</span> : <Link to={`/app/contrats/${encodeURIComponent(m.id)}`}>{formatLastName(m.lastName)} {formatFirstName(m.firstName)}</Link>}</td><td>{m.nif}<small>{m.position}</small></td><td>{formatCurrency(m.salaryNumber)} HTG</td></tr>)}</tbody></table>{!members.length && <p className="list-empty">Cette liste est vide. Ajoutez des contrats pour composer le lot.</p>}</div>
    <details className="list-history"><summary>Historique de la liste</summary>{[...list.history].reverse().map((event, index) => <p key={index}><strong>{historyLabels[event.action] ?? event.action}</strong> · {event.actor} · {new Date(event.at).toLocaleString("fr-FR")}{event.reason && <small>{event.reason}</small>}</p>)}</details>
    {moving && <ListAssignmentDialog contractIds={moving} onClose={() => setMoving(null)} />}
  </section>;
}
