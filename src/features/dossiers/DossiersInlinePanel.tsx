import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dossier } from "../../data/types";
import { getDossierActivityDate, isDossierArchived } from "../../lib/dossier";
import { useAuth } from "../auth/auth";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";
import { useDeleteDossier, useDossierContractMetrics, useDossiersList, useUpdateDossier } from "./dossiersApi";
import { DossierDialog } from "./DossierDialog";
import { DossierForm } from "./DossierForm";
import "./dossiers.css";

type Props = {
  workspaceId: string;
  canManage: boolean;
  onDossierCreated?: (dossierId: string) => void;
  onViewDossier: (dossierId: string) => void;
};
type View = "active" | "archived" | "classified" | "all";
type Scope = "all" | "mine" | "others";
type Sort = "recent" | "deadline" | "name" | "priority";

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-rounded" aria-hidden="true">{name}</span>;
}
function dateLabel(value?: string | null) {
  if (!value) return "Sans échéance";
  const date = new Date(value.length > 10 ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Sans échéance" : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}
function statusLabel(dossier: Dossier) {
  return dossier.status === "classified" ? "Classé" : isDossierArchived(dossier) ? "Archivé" : "En traitement";
}
function Progress({ done, target }: { done: number; target: number }) {
  return <div className="dossiers-progress">
    <span>{done} terminé{done > 1 ? "s" : ""}{target > 0 && <span> / {target}</span>}</span>
    {target > 0 && <progress aria-label="Contrats terminés sur l’objectif" value={Math.min(done, target)} max={target} />}
  </div>;
}

export function DossiersInlinePanel({ workspaceId, canManage, onDossierCreated, onViewDossier }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobileViewport();
  const canCreate = canManage && !isMobile;
  const { user } = useAuth();
  const list = useDossiersList(workspaceId);
  const metricsQuery = useDossierContractMetrics(workspaceId);
  const dossiers = list.data ?? [];
  const metrics = metricsQuery.data ?? {};
  const update = useUpdateDossier();
  const remove = useDeleteDossier();
  const [view, setView] = useState<View>("active");
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Dossier | "create" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const busy = update.isPending || remove.isPending;
  const selected = dossiers.find(dossier => dossier.id === selectedId);
  const isMine = (dossier: Dossier) => Boolean(user?.id) && (dossier.createdBy
    ? dossier.createdBy === user?.id : Boolean(metrics[dossier.id]?.authorIds?.includes(user!.id)));
  const scoped = dossiers.filter(dossier => scope === "all" || (scope === "mine" ? isMine(dossier) : !isMine(dossier)));
  const byView: Record<View, Dossier[]> = {
    active: scoped.filter(dossier => dossier.status !== "classified" && !isDossierArchived(dossier)),
    archived: scoped.filter(dossier => isDossierArchived(dossier)),
    classified: scoped.filter(dossier => dossier.status === "classified"),
    all: scoped
  };
  const search = normalize(query.trim());
  const displayed = byView[view].filter(dossier => normalize([
    dossier.name, dossier.focalPoint, dossier.roadmapSheetNumber, dossier.comment
  ].filter(Boolean).join(" ")).includes(search)).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "fr", { numeric: true });
    if (sort === "deadline") return (a.deadlineDate || "9999").localeCompare(b.deadlineDate || "9999") || a.name.localeCompare(b.name, "fr");
    if (sort === "priority" && a.priority !== b.priority) return a.priority === "urgence" ? -1 : 1;
    return (getDossierActivityDate(b)?.getTime() ?? 0) - (getDossierActivityDate(a)?.getTime() ?? 0);
  });
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const overdue = (dossier: Dossier) => dossier.status !== "classified" && !isDossierArchived(dossier)
    && Boolean(dossier.deadlineDate && dossier.deadlineDate < todayKey);
  const views: { id: View; label: string }[] = [
    { id: "active", label: "En traitement" }, { id: "archived", label: "Archivés" },
    { id: "classified", label: "Classés" }, { id: "all", label: "Tous" }
  ];

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => { setNotice(""); setCreatedId(null); }, 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openContracts(id: string) {
    onViewDossier(id);
  }
  function closeDetails() { setSelectedId(null); setConfirmDelete(false); setError(""); }
  function showDetails(id: string) { setSelectedId(id); setConfirmDelete(false); setError(""); }
  function resetFilters() { setQuery(""); setScope("all"); setView("active"); }
  async function changeStatus(dossier: Dossier) {
    if (!canManage || busy) return;
    try {
      setError("");
      await update.mutateAsync({ id: dossier.id, workspaceId, status: dossier.status === "classified" ? "active" : "classified" });
      setNotice(dossier.status === "classified" ? "Dossier remis en traitement." : "Dossier classé.");
      closeDetails();
    } catch { setError("Impossible de modifier le classement du dossier."); }
  }
  async function deleteDossier(dossier: Dossier) {
    if (!canManage || busy) return;
    try {
      setError("");
      await remove.mutateAsync({ id: dossier.id, workspaceId });
      closeDetails();
      setNotice("Dossier supprimé. Les contrats sont conservés.");
    } catch { setError("Impossible de supprimer le dossier."); }
  }

  return <section className="dossiers-workspace" aria-label="Dossiers">
    <header className="dossiers-heading">
      <div className="dossiers-title"><h1>Dossiers</h1><span>{dossiers.length}</span></div>
      {canCreate && <button className="btn btn-primary" onClick={() => setForm("create")}><Icon name="add" />Nouveau dossier</button>}
    </header>
    <div className="dossiers-navigation">
      <div className="dossiers-tabs" role="group" aria-label="État des dossiers">
        {views.map(item => <button key={item.id} type="button" aria-pressed={view === item.id}
          className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)}>
          {item.label}<span>{byView[item.id].length}</span>
        </button>)}
      </div>
    </div>
    <div className="dossiers-toolbar">
      <div className="dossiers-search"><Icon name="search" />
        <input type="search" aria-label="Rechercher un dossier" placeholder="Rechercher un dossier…" value={query} onChange={e => setQuery(e.target.value)} />
        {query && <button className="dossiers-icon-button" onClick={() => setQuery("")} aria-label="Effacer la recherche"><Icon name="close" /></button>}
      </div>
      <select className="select" aria-label="Propriétaire des dossiers" value={scope} onChange={e => setScope(e.target.value as Scope)}>
        <option value="all">Tout le monde</option><option value="mine">Mes dossiers</option><option value="others">Autres dossiers</option>
      </select>
      <select className="select" aria-label="Trier les dossiers" value={sort} onChange={e => setSort(e.target.value as Sort)}>
        <option value="recent">Récemment modifiés</option><option value="deadline">Échéance proche</option>
        <option value="priority">Priorité urgente</option><option value="name">Nom : A à Z</option>
      </select>
    </div>
    {notice && <div className="dossiers-notice" role="status"><Icon name="check_circle" /><span>{notice}</span>
      <button className="dossiers-icon-button" aria-label="Fermer la notification" onClick={() => setNotice("")}><Icon name="close" /></button>
    </div>}
    {list.isError && <div className="dossiers-error" role="alert">Impossible d’actualiser les dossiers. <button onClick={() => void list.refetch()}>Réessayer</button></div>}
    {metricsQuery.isError && <div className="dossiers-error" role="alert">Suivi des contrats indisponible. <button onClick={() => void metricsQuery.refetch()}>Réessayer</button></div>}
    <div className="dossiers-collection" aria-busy={list.isLoading}>
      <div className="dossiers-table-head" aria-hidden="true"><span>Dossier</span><span>Contrats</span><span>Échéance</span><span /></div>
      {list.isLoading ? <div className="dossiers-loading" role="status">Chargement des dossiers…</div>
        : displayed.length === 0 ? <div className="dossiers-empty">
          <Icon name={query ? "search_off" : "folder_open"} />
          <h2>{query ? "Aucun résultat" : view === "archived" ? "Aucun dossier archivé" : view === "classified" ? "Aucun dossier classé" : "Aucun dossier"}</h2>
          {(query || scope !== "all" || view !== "active") && <button className="btn btn-outline" onClick={resetFilters}>Réinitialiser les filtres</button>}
          {!query && scope === "all" && view === "active" && canCreate && <button className="btn btn-primary" onClick={() => setForm("create")}>Créer un dossier</button>}
        </div> : <ul className="dossiers-rows">
          {displayed.map(dossier => {
            const count = metrics[dossier.id];
            return <li key={dossier.id} className={`dossiers-row${dossier.id === createdId ? " is-new" : ""}`}>
              <button className="dossiers-open" onClick={() => openContracts(dossier.id)} aria-label={`Ouvrir les contrats de ${dossier.name}`}>
                <span className={`dossiers-folder${dossier.priority === "urgence" ? " is-urgent" : ""}`}><Icon name="folder" /></span>
                <span className="dossiers-row-title"><strong>{dossier.name}</strong>
                  <span className="dossiers-row-meta">
                    {dossier.priority === "urgence" && <span className="dossiers-urgent">Urgent</span>}
                    {view === "all" && <span>{statusLabel(dossier)}</span>}
                    {dossier.focalPoint && <span>{dossier.focalPoint}</span>}
                    {dossier.roadmapSheetNumber && <span>{dossier.roadmapSheetNumber}</span>}
                  </span>
                </span>
              </button>
              <div className="dossiers-row-count">{metricsQuery.isLoading || metricsQuery.isError ? <span>—</span> : <>
                <strong>{count?.assignedCount ?? 0}<span> contrat{(count?.assignedCount ?? 0) > 1 ? "s" : ""}</span></strong>
                <Progress done={count?.doneCount ?? 0} target={dossier.contractTargetCount} />
              </>}</div>
              <div className={`dossiers-row-date${overdue(dossier) ? " is-overdue" : ""}`}>
                <span>{dateLabel(dossier.deadlineDate)}</span>{overdue(dossier) && <small>En retard</small>}
              </div>
              <button className="dossiers-icon-button dossiers-detail-trigger" aria-label={`Détails de ${dossier.name}`} title="Détails du dossier" onClick={() => showDetails(dossier.id)}><Icon name="more_horiz" /></button>
            </li>;
          })}
        </ul>}
    </div>
    {!list.isLoading && displayed.length > 0 && <div className="dossiers-result-count" role="status">{displayed.length} dossier{displayed.length > 1 ? "s" : ""}{search && ` pour « ${query.trim()} »`}</div>}

    {selected && !form && <DossierDialog title={selected.name} drawer busy={busy} onClose={closeDetails}>
      <div className="dossiers-detail-body">
        <div className="dossiers-detail-badges"><span>{statusLabel(selected)}</span>{selected.priority === "urgence" && <span className="dossiers-urgent">Urgent</span>}{selected.isEphemeral && <span>Éphémère</span>}</div>
        <div className="dossiers-detail-count"><Icon name="folder_open" /><strong>{metricsQuery.isLoading || metricsQuery.isError ? "—" : metrics[selected.id]?.assignedCount ?? 0}</strong><span>contrats</span></div>
        {!metricsQuery.isLoading && !metricsQuery.isError && <Progress done={metrics[selected.id]?.doneCount ?? 0} target={selected.contractTargetCount} />}
        <button className="btn btn-primary dossiers-view-contracts" onClick={() => { closeDetails(); openContracts(selected.id); }}>Voir les contrats<Icon name="arrow_forward" /></button>
        {canManage && <button className="btn btn-outline dossiers-view-contracts" onClick={() => navigate(`/app/contrats/nouveau?dossierId=${encodeURIComponent(selected.id)}`)}><Icon name="add" />Ajouter un contrat</button>}
        <dl className="dossiers-detail-meta">
          <div><dt>Échéance</dt><dd className={overdue(selected) ? "is-overdue" : ""}>{dateLabel(selected.deadlineDate)}</dd></div>
          {selected.focalPoint && <div><dt>Point focal</dt><dd>{selected.focalPoint}</dd></div>}
          {selected.roadmapSheetNumber && <div><dt>Feuille de route</dt><dd>{selected.roadmapSheetNumber}</dd></div>}
          {Boolean(selected.defaultDurationMonths) && <div><dt>Durée par défaut</dt><dd>{selected.defaultDurationMonths} mois</dd></div>}
          <div><dt>Modifié le</dt><dd>{dateLabel(selected.updatedAt)}</dd></div>
        </dl>
        {selected.comment && <section className="dossiers-notes"><h3>Commentaire</h3><p>{selected.comment}</p></section>}
        {error && <p role="alert" className="dossiers-error">{error}</p>}
      </div>
      {canManage && <footer className="dossiers-detail-actions">
        {confirmDelete ? <div className="dossiers-delete-confirm" role="group" aria-label="Confirmer la suppression">
          <strong>Supprimer ce dossier ?</strong><p>Les contrats seront conservés sans dossier.</p>
          <div><button className="btn btn-outline" disabled={busy} onClick={() => { setConfirmDelete(false); setError(""); }}>Annuler</button>
            <button className="btn dossiers-danger-button" disabled={busy} onClick={() => void deleteDossier(selected)}>{remove.isPending ? "Suppression…" : "Supprimer"}</button></div>
        </div> : <>
          <button className="btn btn-outline" disabled={busy} onClick={() => setForm(selected)}><Icon name="edit" />Modifier</button>
          <button className="btn btn-outline" disabled={busy} onClick={() => void changeStatus(selected)}><Icon name={selected.status === "classified" ? "unarchive" : "inventory_2"} />{update.isPending ? "Enregistrement…" : selected.status === "classified" ? "Remettre en traitement" : "Classer"}</button>
          <button className="dossiers-icon-button dossiers-delete-button" disabled={busy} aria-label="Supprimer le dossier" onClick={() => setConfirmDelete(true)}><Icon name="delete" /></button>
        </>}
      </footer>}
    </DossierDialog>}
    {canManage && form && (form !== "create" || canCreate) && <DossierForm key={form === "create" ? "create" : form.id} workspaceId={workspaceId} dossier={form === "create" ? undefined : form}
      onClose={() => setForm(null)} onSaved={saved => {
        const isCreation = form === "create";
        setForm(null); closeDetails();
        setNotice(isCreation ? `Dossier « ${saved.name} » créé.` : "Dossier mis à jour.");
        if (isCreation) { resetFilters(); setSort("recent"); setCreatedId(saved.id); onDossierCreated?.(saved.id); }
      }} />}
  </section>;
}
