import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { useSalaryGrid } from "../salary-grid/salaryGridApi";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";
import { formatCurrency, formatFirstName, formatLastName } from "../../lib/format";
import { useContractLists, useListOperation } from "./listsApi";
import { listError, listName, listTotals, normalizeListSearch, sortedMembers, type ContractList, type ListOperation } from "./listModel";
import { ListDialog, ListIcon } from "./ListDialog";
import { ListAssignmentDialog } from "./ListAssignmentDialog";
import { ListAddContractsDialog } from "./ListAddContractsDialog";

const historyLabels: Record<string, string> = { create: "Création", assign: "Composition modifiée", visa: "Visa modifié", seal: "Scellement", reopen: "Réouverture" };
type Confirmation = { action: "seal" | "reopen" | "delete" | "remove"; version: number; contractIds: string[] };

export function ListDetail({ list, onDeleted, onBack }: { list: ContractList; onDeleted: () => void; onBack: () => void }) {
  const { user, can } = useAuth();
  const isMobile = useIsMobileViewport();
  const canManage = can("contracts.edit") && !isMobile;
  const editable = canManage && !list.sealedAt;
  const operation = useListOperation();
  const query = useContractLists();
  const salaryGrid = useSalaryGrid();
  const [tab, setTab] = useState<"members" | "history">("members");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [editingVisa, setEditingVisa] = useState(false);
  const [visa, setVisa] = useState(list.visaNumber ?? "");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const members = sortedMembers(list.members);
  const visibleMembers = members.filter(member => normalizeListSearch(`${member.lastName} ${member.firstName} ${member.nif} ${member.position}`).includes(normalizeListSearch(search.trim())));
  const totals = listTotals(list);
  const allChecked = visibleMembers.length > 0 && visibleMembers.every(member => selected.includes(member.id));
  const someChecked = visibleMembers.some(member => selected.includes(member.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked && !allChecked; }, [someChecked, allChecked, tab, editable]);
  useEffect(() => { setSelected(ids => ids.filter(id => list.members.some(member => member.id === id))); }, [list.members]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (isMobile) { setAdding(false); setMoving(null); setEditingVisa(false); setConfirm(null); setSelected([]); }
  }, [isMobile]);

  function ask(action: Confirmation["action"]) { setActionError(""); setReason(""); setConfirm({ action, version: list.version, contractIds: [...selected] }); }
  async function run(input: ListOperation) {
    if (!canManage || operation.isPending || (input.action === "reopen" ? user?.role !== "admin" : !editable)) return;
    setActionError("");
    try {
      await operation.mutateAsync({ listId: list.id, version: list.version, ...input });
      setConfirm(null); setEditingVisa(false); setSelected([]);
      setNotice(input.action === "visa" ? "Visa enregistré." : input.action === "seal" ? "Liste scellée." : input.action === "reopen" ? "Liste rouverte." : "Liste mise à jour.");
      if (input.action === "delete") onDeleted();
    } catch (error) { setActionError(listError(error)); }
  }
  async function exportExcel() {
    if (exporting || !can("contracts.export")) return;
    setExporting(true); setExportError("");
    try {
      const reference = navigator.onLine ? await salaryGrid.refetch() : { data: salaryGrid.data, error: null };
      if (reference.error) throw reference.error;
      if (!reference.data) throw new Error("La grille des titres est indisponible. Réessayez le téléchargement.");
      const { downloadListExcel } = await import("./downloadListExcel");
      await downloadListExcel(async () => {
        const result = await query.refetch();
        if (result.error) throw result.error;
        const current = result.data?.find(item => item.id === list.id && item.workspaceId === user?.workspaceId);
        if (!current) throw new Error("Cette liste n’est plus disponible. Actualisez la page.");
        return current;
      }, reference.data);
    } catch (error) { setExportError(listError(error)); }
    finally { setExporting(false); }
  }

  return <section className="lists-detail" aria-label="Liste sélectionnée">
    {isMobile && <button className="lists-back" onClick={onBack}><ListIcon name="arrow_back" />Toutes les listes</button>}
    <header className="lists-detail-heading"><div>
      <div className="lists-detail-status">{list.sealedAt ? <span className="badge list-sealed"><ListIcon name="lock" />Scellée</span> : <span>En préparation</span>}<span>Réf. {list.id.slice(0, 8)}</span></div>
      <h2>{listName(list)}</h2>
    </div>
      {can("contracts.export") && <button className="btn btn-primary lists-export" onClick={() => void exportExcel()} disabled={exporting || !members.length || operation.isPending}><ListIcon name="download" />{exporting ? "Export en cours…" : "Exporter en Excel"}</button>}
    </header>
    <div className="lists-facts">
      <div><span>Durée</span><strong>{list.durationMonths}<small> mois</small></strong></div>
      <div><span>Total mensuel</span><strong>{formatCurrency(totals.monthly)}<small> HTG</small></strong></div>
      <div className="lists-total"><span>Montant total</span><strong>{formatCurrency(totals.total)}<small> HTG</small></strong></div>
      <div className="lists-visa-fact"><span>Visa {editable && <button className="lists-icon-button" aria-label="Modifier le visa" onClick={() => { setVisa(list.visaNumber ?? ""); setActionError(""); setEditingVisa(true); }}><ListIcon name="edit" /></button>}</span><strong>{list.visaNumber || "—"}</strong></div>
    </div>
    {notice && <p className="lists-notice" role="status"><ListIcon name="check_circle" />{notice}</p>}
    {exportError && <p className="lists-error" role="alert">{exportError}</p>}
    <div className="lists-detail-navigation">
      <div className="lists-detail-tabs" role="group" aria-label="Contenu de la liste">
        <button aria-pressed={tab === "members"} onClick={() => setTab("members")}>Contrats <span>{members.length}</span></button>
        <button aria-pressed={tab === "history"} onClick={() => setTab("history")}>Historique</button>
      </div>
      {canManage && <div className="lists-lifecycle-actions">
        {editable && members.length > 0 && <button className="btn btn-outline" onClick={() => ask("seal")} disabled={operation.isPending}><ListIcon name="lock" />Sceller la liste</button>}
        {editable && !members.length && <button className="lists-icon-button" aria-label="Supprimer la liste vide" onClick={() => ask("delete")} disabled={operation.isPending}><ListIcon name="delete" /></button>}
        {list.sealedAt && user?.role === "admin" && <button className="btn btn-outline" onClick={() => ask("reopen")} disabled={operation.isPending}><ListIcon name="lock_open" />Rouvrir la liste</button>}
      </div>}
    </div>
    {tab === "history" ? <div className="lists-history">
      {[...list.history].reverse().map((event, index) => <article key={index}><span className="lists-history-icon"><ListIcon name={event.action === "seal" ? "lock" : event.action === "reopen" ? "lock_open" : "edit"} /></span><div><strong>{historyLabels[event.action] ?? event.action}</strong><p>{event.actor}</p>{event.reason && <p className="lists-history-reason">{event.reason}</p>}</div><time dateTime={event.at}>{new Date(event.at).toLocaleString("fr-FR")}</time></article>)}
      {!list.history.length && <div className="lists-empty">Aucun événement</div>}
    </div> : <>
      <div className="lists-members-toolbar"><div className="lists-search"><ListIcon name="search" /><input type="search" aria-label="Rechercher dans les contrats du lot" placeholder="Nom, NIF ou titre…" value={search} onChange={event => setSearch(event.target.value)} />
        {search && <button className="lists-icon-button" aria-label="Effacer la recherche de contrats" onClick={() => setSearch("")}><ListIcon name="close" /></button>}
      </div>{editable && <button className="btn btn-outline" disabled={operation.isPending} onClick={() => setAdding(true)}><ListIcon name="add" />Ajouter des contrats</button>}</div>
      {editable && selected.length > 0 && <div className="lists-selection" role="region" aria-label="Contrats sélectionnés"><strong>{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</strong>
        <button className="btn btn-outline" onClick={() => setMoving([...selected])} disabled={operation.isPending}>Changer de liste</button>
        <button className="btn btn-outline" onClick={() => ask("remove")} disabled={operation.isPending}>Retirer</button>
        <button className="lists-icon-button" aria-label="Annuler la sélection" onClick={() => setSelected([])}><ListIcon name="close" /></button>
      </div>}
      {isMobile ? <div className="lists-mobile-members">{visibleMembers.map(member => <article key={member.id}><div><strong>{formatLastName(member.lastName)} {formatFirstName(member.firstName)}</strong><span>{member.position}</span><small>{member.nif}</small></div><b>{formatCurrency(member.salaryNumber)}<small> HTG / mois</small></b></article>)}</div>
        : <div className="lists-table-scroll"><table className="lists-members-table"><thead><tr>
          {editable && <th className="lists-checkbox-cell"><input ref={selectAllRef} aria-label="Sélectionner tous les contrats affichés" type="checkbox" checked={allChecked} onChange={event => setSelected(ids => event.target.checked ? [...new Set([...ids, ...visibleMembers.map(member => member.id)])] : ids.filter(id => !visibleMembers.some(member => member.id === id)))} /></th>}
          <th>Nom et prénom</th><th>NIF</th><th>Titre</th><th>Salaire mensuel</th>
        </tr></thead><tbody>{visibleMembers.map(member => <tr key={member.id} className={selected.includes(member.id) && editable ? "is-selected" : ""}>
          {editable && <td className="lists-checkbox-cell"><input type="checkbox" aria-label={`Sélectionner ${member.firstName} ${member.lastName}`} checked={selected.includes(member.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, member.id] : ids.filter(id => id !== member.id))} /></td>}
          <td><Link to={`/app/contrats/${encodeURIComponent(member.id)}`}>{formatLastName(member.lastName)} {formatFirstName(member.firstName)}</Link></td><td>{member.nif}</td><td>{member.position}</td><td>{formatCurrency(member.salaryNumber)} HTG</td>
        </tr>)}</tbody></table></div>}
      {!visibleMembers.length && <div className="lists-empty"><ListIcon name={search ? "search_off" : "description"} /><h3>{search ? "Aucun contrat trouvé" : "Cette liste est vide"}</h3>{search && <button className="btn btn-outline" onClick={() => setSearch("")}>Effacer la recherche</button>}</div>}
      {visibleMembers.length > 0 && <div className="lists-members-count">{visibleMembers.length} contrat{visibleMembers.length > 1 ? "s" : ""}{search && ` sur ${members.length}`}</div>}
    </>}
    {editingVisa && editable && <ListDialog title="Modifier le visa" busy={operation.isPending} onClose={() => setEditingVisa(false)}>
      <form onSubmit={event => { event.preventDefault(); void run({ action: "visa", visaNumber: visa.trim() }); }}>
        <div className="lists-dialog-body"><label className="lists-field">Numéro de visa<input className="input" data-autofocus maxLength={120} value={visa} onChange={event => setVisa(event.target.value)} disabled={operation.isPending} /></label>{actionError && <p className="lists-error" role="alert">{actionError}</p>}</div>
        <footer className="lists-dialog-footer"><button type="button" className="btn btn-outline" disabled={operation.isPending} onClick={() => setEditingVisa(false)}>Annuler</button><button className="btn btn-primary" disabled={operation.isPending || visa.trim() === (list.visaNumber ?? "")}>Enregistrer le visa</button></footer>
      </form>
    </ListDialog>}
    {confirm && canManage && <ListDialog title={confirm.action === "seal" ? "Sceller la liste" : confirm.action === "reopen" ? "Rouvrir la liste" : confirm.action === "delete" ? "Supprimer la liste vide" : "Retirer les contrats"} busy={operation.isPending} onClose={() => setConfirm(null)}>
      <div className="lists-dialog-body">
        <strong>{listName(list)}</strong>
        <p>{confirm.action === "seal" ? `${members.length} contrats · ${list.durationMonths} mois · ${formatCurrency(totals.total)} HTG. Le contenu et le visa seront verrouillés.` : confirm.action === "reopen" ? "Le lot redeviendra modifiable. Le motif sera conservé dans l’historique." : confirm.action === "remove" ? `${confirm.contractIds.length} contrat(s) seront conservés sans liste.` : "Cette liste vide sera supprimée."}</p>
        {confirm.action === "reopen" && <label className="lists-field">Motif de réouverture<textarea className="textarea" data-autofocus value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={operation.isPending} /></label>}
        {actionError && <p className="lists-error" role="alert">{actionError}</p>}
      </div>
      <footer className="lists-dialog-footer"><button className="btn btn-outline" onClick={() => setConfirm(null)} disabled={operation.isPending}>Annuler</button><button className="btn btn-primary" disabled={operation.isPending || (confirm.action === "reopen" && !reason.trim())} onClick={() => void run(confirm.action === "remove" ? { action: "assign", listId: null, contractIds: confirm.contractIds } : { action: confirm.action, reason: reason.trim(), version: confirm.version })}>{operation.isPending ? "Enregistrement…" : "Confirmer"}</button></footer>
    </ListDialog>}
    {adding && editable && <ListAddContractsDialog list={list} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); setNotice("Contrats ajoutés."); }} />}
    {moving && editable && <ListAssignmentDialog contractIds={moving} onClose={() => setMoving(null)} />}
  </section>;
}
