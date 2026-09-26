import { useState } from "react";
import type { Contract, OutboxItem } from "../../data/types";
import { contractSyncInfo } from "../../data/local/outboxDependencies";
import { resolveOfflineConflict } from "../../data/local/resolveConflict";

const fieldLabels: Record<string, string> = { position: "Poste", assignment: "Affectation", salaryNumber: "Salaire",
  salaryText: "Salaire en lettres", durationMonths: "Durée", dossierId: "Dossier", status: "État",
  commentaire: "Commentaire", nif: "NIF", applicantId: "Identification", name: "Nom", deletedAt: "Suppression" };

export function ContractSyncIndicator({ contract, pending, online, cloudEnabled, onRetry }: {
  contract: Contract; pending: OutboxItem[]; online: boolean; cloudEnabled: boolean; onRetry: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, "local" | "remote">>({});
  const conflict = pending.find(item => item.conflict && (item.payload.id === contract.id || item.payload.id === contract.dossierId || (Array.isArray(item.payload.contractIds) && item.payload.contractIds.includes(contract.id))));
  const info = contractSyncInfo(contract, pending, cloudEnabled);
  return <span className="contract-sync-indicator" onClick={(event) => event.stopPropagation()}>
    <button type="button" className={`badge ${info.pending ? "warning" : "success"}`}
      aria-label={info.label} title={`${info.label} — ${info.detail}`} aria-expanded={open}
      onClick={() => setOpen(!open)}>
      <span className="material-symbols-rounded" aria-hidden="true">{info.icon}</span>
    </button>
    {open && <span className="contract-sync-details" role="status">
      <strong>{info.label}</strong>
      <span>{info.detail}</span>
      {error && <span>{error}</span>}
      {conflict?.conflict && <>
        {conflict.conflict.fields.map(field => <label key={field}>
          {fieldLabels[field] ?? field}
          <select value={choices[field] ?? ""} onChange={event => setChoices({ ...choices, [field]: event.target.value as "local" | "remote" })}>
            <option value="" disabled>Choisir</option>
            <option value="local">Appareil : {field === "deletedAt" ? "Supprimer" : String(conflict.payload[field] ?? "—")}</option>
            <option value="remote">Serveur : {field === "deletedAt" ? "Conserver" : String(conflict.conflict!.remote[field] ?? "—")}</option>
          </select>
        </label>)}
        <button type="button" className="btn btn-outline" disabled={busy || conflict.conflict.fields.some(field => !choices[field])}
          onClick={async () => {
            setBusy(true); setError(null);
            try { await resolveOfflineConflict(conflict.id, choices); setChoices({}); await onRetry(); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Résolution impossible."); }
            finally { setBusy(false); }
          }}>Appliquer</button>
      </>}
      {cloudEnabled && info.pending && <button type="button" className="btn btn-outline" disabled={!online || busy}
        onClick={async () => {
          setBusy(true); setError(null);
          try { await onRetry(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Synchronisation impossible."); }
          finally { setBusy(false); }
        }}>{busy ? "Synchronisation…" : online ? "Réessayer la synchronisation" : "En attente d’Internet"}</button>}
      <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Fermer</button>
    </span>}
  </span>;
}
