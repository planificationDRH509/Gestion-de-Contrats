import { useState } from "react";
import type { Contract, OutboxItem } from "../../data/types";
import { contractSyncInfo } from "../../data/local/outboxDependencies";

export function ContractSyncIndicator({ contract, pending, online, cloudEnabled, onRetry }: {
  contract: Contract; pending: OutboxItem[]; online: boolean; cloudEnabled: boolean; onRetry: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
