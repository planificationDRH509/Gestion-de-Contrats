import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getSyncIssues, resolveSyncIssue, type SyncIssue, type SyncIssueAction } from "../../data/supabase/syncIssues";
import { useAuth } from "../auth/auth";
import "./syncIssues.css";

const actionLabels: Record<SyncIssueAction, string> = {
  retry: "Réessayer",
  "refresh-local": "Actualiser en local",
  "refresh-server": "Actualiser le serveur",
  "delete-local": "Supprimer en local",
  "delete-server": "Supprimer sur le serveur",
  ignore: "Ignorer"
};

function confirmation(issue: SyncIssue, action: SyncIssueAction): string | null {
  const prompts: Partial<Record<SyncIssueAction, string>> = {
    "refresh-local": "Reprendre la version du serveur et abandonner les modifications locales en attente",
    "refresh-server": "Envoyer les modifications locales, y compris les valeurs en conflit, au serveur",
    "delete-local": "Supprimer les données locales concernées et leurs modifications en attente",
    "delete-server": "Supprimer les données concernées sur le serveur et abandonner leurs modifications en attente",
    ignore: "Abandonner les modifications en attente et reprendre les données disponibles sur le serveur"
  };
  const prompt = prompts[action];
  if (!prompt) return null;
  return `${prompt} pour « ${issue.title} » ?${(issue.affectedCount ?? 1) > 1 ? ` ${issue.affectedCount} opérations liées sont concernées.` : ""}`;
}

const queryKeys = [
  "contracts", "contract", "contract-lists", "nif-lookup", "identification", "dossiers", "tags",
  "pinned-contracts", "suggestions", "task_contract_suggestions", "salary-grid", "institution-prepositions", "ministers"
];

export function SyncIssuesModal({ workspaceId, isOnline, isSyncing, pendingCount, onSync, onClose }: {
  workspaceId: string;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  onSync: () => void | Promise<void>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const activeAction = useRef(false);
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id?: string; message: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      setIssues(getSyncIssues(workspaceId));
      setReadError(null);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Impossible de charger les erreurs.");
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
    window.addEventListener("contribution-offline-sync", refresh);
    return () => window.removeEventListener("contribution-offline-sync", refresh);
  }, [refresh]);

  useEffect(() => { refresh(); }, [isSyncing, pendingCount, refresh]);

  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  const resolve = async (issue: SyncIssue, action: SyncIssueAction) => {
    if (activeAction.current || !isOnline) return;
    const prompt = confirmation(issue, action);
    if (prompt && !window.confirm(prompt)) return;
    activeAction.current = true;
    setBusy(issue.id);
    setFailure(null);
    try {
      await resolveSyncIssue(workspaceId, issue.id, action, issue.fingerprint);
    } catch (error) {
      setFailure({ id: issue.id, message: error instanceof Error ? error.message : "Résolution impossible." });
    } finally {
      // Restoring the local record may succeed before the resumed upload fails.
      await Promise.allSettled(queryKeys.map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      activeAction.current = false;
      setBusy(null);
      refresh();
    }
  };

  const synchronize = async () => {
    if (activeAction.current || !isOnline || isSyncing) return;
    activeAction.current = true;
    setBusy("sync");
    setFailure(null);
    try { await onSync(); }
    catch (error) { setFailure({ message: error instanceof Error ? error.message : "Synchronisation impossible." }); }
    finally { activeAction.current = false; setBusy(null); refresh(); }
  };

  return createPortal(<dialog ref={ref} className="sync-issues-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!activeAction.current) onClose(); }}>
    <header className="sync-issues-heading">
      <h2 id={titleId}>Synchronisation</h2>
      <span>{issues.length} erreur{issues.length > 1 ? "s" : ""}</span>
    </header>
    <div className="sync-issues-body" aria-busy={Boolean(busy)}>
      {readError && <p className="sync-issues-error" role="alert">{readError}</p>}
      {failure && (!failure.id || !issues.some(issue => issue.id === failure.id)) &&
        <p className="sync-issues-error" role="alert">{failure.message}</p>}
      {!isOnline && <p className="sync-issues-status" role="status">Hors ligne</p>}
      {busy && <p className="sync-issues-status" role="status">{busy === "sync" ? "Synchronisation…" : "Résolution…"}</p>}
      {!issues.length && !readError && <p className="sync-issues-empty">{isSyncing ? "Synchronisation…" : "Aucune erreur de synchronisation."}</p>}
      <ul className="sync-issues-list">
        {issues.map(issue => <li key={issue.id}><article className="sync-issue" aria-label={issue.title}>
          <h3>{issue.title}</h3>
          <p>{issue.message}</p>
          <div className="sync-issue-actions">
            {issue.actions.map(action => <button key={action} type="button"
              className={`btn btn-outline${action.startsWith("delete-") ? " sync-issue-danger" : ""}`}
              disabled={!isOnline || Boolean(busy)} onClick={() => void resolve(issue, action)}>
              {actionLabels[action]}
            </button>)}
            {!busy && issue.target?.kind === "contract" && can("contracts.edit") &&
              <Link className="btn btn-outline" to={`/app/contrats/${encodeURIComponent(issue.target.id)}/modifier`} onClick={onClose}>Corriger</Link>}
            {!busy && issue.target?.kind === "applicant" && can("identification.manage") &&
              <Link className="btn btn-outline" to="/app/identification" onClick={onClose}>Corriger</Link>}
          </div>
          {failure?.id === issue.id && <p className="sync-issues-error" role="alert">{failure.message}</p>}
        </article></li>)}
      </ul>
    </div>
    <footer className="sync-issues-footer">
      <span>{pendingCount > 0 ? `${pendingCount} en attente` : ""}</span>
      <button type="button" className="btn btn-outline" disabled={Boolean(busy)} onClick={onClose}>Fermer</button>
      <button type="button" className="btn btn-primary" disabled={!isOnline || isSyncing || Boolean(busy)} onClick={() => void synchronize()}>Synchroniser</button>
    </footer>
  </dialog>, document.body);
}
