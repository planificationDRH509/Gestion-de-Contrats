import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, FolderOpen, Plus, Printer, ReceiptText, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../auth/auth";
import { groupPrintHistory, isPrintHistoryDuplicate, loadPrintHistory, savePrintHistory, type PrintHistoryEntry } from "../../lib/printHistory";
import { createId } from "../../lib/uuid";

export function PrintHistoryPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? "";
  const workspaceId = user?.workspaceId ?? "";
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [printHistory, setPrintHistory] = useState<PrintHistoryEntry[]>(() =>
    loadPrintHistory(userId, workspaceId)
  );
  const printHistoryGroups = useMemo(() => groupPrintHistory(printHistory), [printHistory]);
  const [undoAction, setUndoAction] = useState<{
    entries: PrintHistoryEntry[];
    index: number;
    label: string;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualFirstName, setManualFirstName] = useState("");
  const [manualLastName, setManualLastName] = useState("");
  const [manualNif, setManualNif] = useState("");
  const [manualNinu, setManualNinu] = useState("");
  const [manualPosition, setManualPosition] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    setPrintHistory(loadPrintHistory(userId, workspaceId));
  }, [userId, workspaceId]);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    const handleFocus = () => setPrintHistory(loadPrintHistory(userId, workspaceId));
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [userId, workspaceId]);


  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    frameRef.current?.remove();
  }, []);

  function formatPrintHistoryLine(entry: PrintHistoryEntry) {
    const firstName = entry.firstName?.trim() ? entry.firstName : "—";
    const lastName = entry.lastName?.trim() ? entry.lastName.toUpperCase() : "—";
    const nif = entry.nif?.trim() ? entry.nif : "—";
    const ninu = entry.ninu?.trim() ? entry.ninu : "—";
    const position = entry.position?.trim() ? entry.position : "—";
    return `${firstName}, ${lastName}, ${nif}, ${ninu}, ${position}`;
  }

  function updatePrintHistory(
    updater:
      | PrintHistoryEntry[]
      | ((prev: PrintHistoryEntry[]) => PrintHistoryEntry[])
  ) {
    setPrintHistory((prev) => {
      const next = typeof updater === "function" ? (updater as (p: PrintHistoryEntry[]) => PrintHistoryEntry[])(prev) : updater;
      savePrintHistory(userId, workspaceId, next);
      return next;
    });
  }

  function resetManualEntryForm() {
    setManualFirstName("");
    setManualLastName("");
    setManualNif("");
    setManualNinu("");
    setManualPosition("");
    setManualError(null);
  }

  function openManualEntryForm() {
    resetManualEntryForm();
    setManualEntryOpen(true);
  }

  function handleManualEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lastName = manualLastName.trim();
    if (!lastName) {
      setManualError("Le nom est obligatoire.");
      return;
    }
    const entry: PrintHistoryEntry = {
      id: createId(),
      contractId: `manual-${createId()}`,
      firstName: manualFirstName.trim(),
      lastName,
      nif: manualNif.trim() || null,
      ninu: manualNinu.trim() || null,
      position: manualPosition.trim(),
      printedAt: new Date().toISOString(),
      partial: false
    };
    if (isPrintHistoryDuplicate(printHistory, entry.nif, entry.ninu)) {
      setManualError("Entrée déjà présente (NIF ou NINU).");
      return;
    }
    updatePrintHistory([...printHistory, entry]);
    setManualEntryOpen(false);
    setManualError(null);
    setActionMessage("Entrée ajoutée.");
  }

  function clearUndoTimer() {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  function enqueueUndo(entries: PrintHistoryEntry[], index: number, label: string) {
    clearUndoTimer();
    setUndoAction({ entries, index, label });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoAction(null);
      undoTimerRef.current = null;
    }, 3000);
  }

  function handleUndo() {
    if (!undoAction) return;
    updatePrintHistory((prev) => {
      const next = [...prev];
      const safeIndex = Math.min(undoAction.index, next.length);
      next.splice(safeIndex, 0, ...undoAction.entries);
      return next;
    });
    clearUndoTimer();
    setUndoAction(null);
  }

  function removePrintHistoryEntries(entryIds: string[], label: string) {
    updatePrintHistory((prev) => {
      const removed = new Set(entryIds);
      const index = prev.findIndex(entry => removed.has(entry.id));
      if (index === -1) return prev;
      enqueueUndo(prev.filter(entry => removed.has(entry.id)), index, label);
      return prev.filter(entry => !removed.has(entry.id));
    });
  }

  function resetPrintHistory() {
    updatePrintHistory([]);
    clearUndoTimer();
    setUndoAction(null);
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildPrintHistoryHtml(entries: PrintHistoryEntry[]) {
    const dateLabel = new Date().toLocaleDateString("fr-FR");
    const lines = entries
      .map((entry, index) => {
        const line = escapeHtml(formatPrintHistoryLine(entry));
        const tag = entry.partial ? `<span class="tag">Imp. Part.</span>` : "";
        return `<div class="line"><span class="num">${index + 1}.</span><span class="text">${line}</span>${tag}</div>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Historique des impressions</title>
    <style>
      @page { size: letter; margin: 0.6in; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Inter", system-ui, sans-serif; color: #0f172a; background: #fff; }
      h1 { font-size: 18px; margin: 0 0 6px; }
      .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
      .list { display: flex; flex-direction: column; gap: 8px; }
      .line { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 12px; }
      .num { width: 22px; flex-shrink: 0; font-weight: 700; color: #1e293b; }
      .text { flex: 1; }
      .tag { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
      .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
      .toolbar button { border: 1px solid #cbd5f5; background: #eef2ff; color: #1e3a8a; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
      .signature { margin-top: 32px; display: flex; justify-content: space-between; gap: 24px; }
      .sig-box { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 12px; color: #475569; text-align: center; }
      @media print { .toolbar { display: none; } }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button onclick="window.print()">Imprimer</button>
    </div>
    <h1>Historique des impressions</h1>
    <div class="meta">Date: ${escapeHtml(dateLabel)}</div>
    <div class="list">
      ${lines || `<div class="line"><span class="text">Aucune entrée.</span></div>`}
    </div>
    <div class="signature">
      <div class="sig-box">Signature 1</div>
      <div class="sig-box">Signature 2</div>
    </div>
  </body>
</html>`;
  }


  function handlePrintHistoryList() {
    if (!printHistory.length) return;
    frameRef.current?.remove();
    const frame = document.createElement("iframe");
    frame.title = "Impression de l’historique";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;bottom:0;left:0";
    frame.addEventListener("load", () => {
      const printWindow = frame.contentWindow;
      if (!printWindow) return;
      printWindow.addEventListener("afterprint", () => {
        setTimeout(() => {
          frame.remove();
          if (window.confirm("Réinitialiser la liste après impression ?")) resetPrintHistory();
        }, 0);
      }, { once: true });
      printWindow.focus();
      printWindow.print();
    }, { once: true });
    frame.srcdoc = buildPrintHistoryHtml(printHistory);
    frameRef.current = frame;
    document.body.appendChild(frame);
  }

  const query = search.trim().toLocaleLowerCase("fr");
  const groups = [...printHistoryGroups].reverse().filter(group => !query || group.entries.some(entry =>
    [entry.firstName, entry.lastName, entry.nif, entry.ninu, entry.position].join(" ").toLocaleLowerCase("fr").includes(query)
  ));

  return (
    <div className="print-history-page">
      <header className="history-page-heading">
        <div className="history-page-title">
          <button type="button" className="btn btn-outline" aria-label="Retour aux contrats" title="Retour aux contrats" onClick={() => navigate("/app/contrats")}><ArrowLeft size={18} /></button>
          <div><h1>Historique d'Impressions</h1><span>{printHistoryGroups.length} impression{printHistoryGroups.length !== 1 ? "s" : ""} · {printHistory.length} contrat{printHistory.length !== 1 ? "s" : ""}</span></div>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-outline" onClick={openManualEntryForm}><Plus size={16} />Ajouter</button>
          <button type="button" className="btn btn-outline" disabled={!printHistory.length} onClick={() => { if (window.confirm("Réinitialiser l’historique des impressions ?")) resetPrintHistory(); }}><Trash2 size={16} />Réinitialiser</button>
          <button type="button" className="btn btn-primary" disabled={!printHistory.length} onClick={handlePrintHistoryList}><Printer size={16} />Imprimer</button>
        </div>
      </header>
      <section className="history-page-content" aria-label="Impressions enregistrées">
        <div className="history-page-filter">
          <Search size={17} aria-hidden="true" />
          <input type="search" aria-label="Rechercher dans l’historique" placeholder="Rechercher un nom, un NIF, un titre…" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <div className="history-table-head" aria-hidden="true"><span>Impression</span><span>Date</span><span>État</span><span /></div>
        <div className="history-page-list">
          {groups.map(group => {
            const entry = group.entries[0];
            const label = group.isBatch ? `Lot de ${group.entries.length} contrats` : `${entry.firstName} ${entry.lastName}`.trim();
            const canOpen = can("contracts.print") && !group.entries.some(item => item.contractId.startsWith("manual-"));
            const partial = group.entries.some(item => item.partial);
            const open = () => navigate(`/app/contrats/print?${new URLSearchParams({ ids: group.entries.map(item => item.contractId).join(",") })}`);
            return (
              <article className="print-history-item history-page-row" key={group.id}>
                <div className="history-entry-identity">
                  <span className="history-entry-icon">{group.isBatch ? <FolderOpen size={21} /> : <ReceiptText size={21} />}</span>
                  {canOpen ? <button className="history-entry-name" onClick={open}>{label}</button> : <strong className="history-entry-name">{label}</strong>}
                </div>
                <time dateTime={entry.printedAt}>{new Date(entry.printedAt).toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                <span className={`history-entry-state${partial ? " is-partial" : ""}`}>{partial ? "Partielle" : "Complète"}</span>
                <div className="history-entry-actions">
                  {canOpen && <button className="icon-btn" title="Ouvrir" aria-label={`Ouvrir ${label}`} onClick={open}><ArrowUpRight size={17} /></button>}
                  <button className="icon-btn" title="Retirer de l’historique" aria-label={group.isBatch ? `Retirer le lot de ${group.entries.length} contrats` : `Retirer ${label}`} onClick={() => removePrintHistoryEntries(group.entries.map(item => item.id), group.isBatch ? "Lot retiré." : "Entrée retirée.")}><X size={17} /></button>
                </div>
              </article>
            );
          })}
        </div>
        {!groups.length && <div className="history-page-empty"><ReceiptText size={32} aria-hidden="true" /><p>{query ? "Aucune impression trouvée." : "Aucune impression enregistrée."}</p></div>}
      </section>
      {actionMessage && <div className="history-page-message" role="status">{actionMessage}</div>}
      {undoAction ? (
        <div className="print-history-undo">
          <span>{undoAction.label}</span>
          <button className="print-history-undo-btn" type="button" onClick={handleUndo}>
            Annuler
          </button>
        </div>
      ) : null}

      {manualEntryOpen ? (
        <div className="print-history-modal">
          <div className="print-history-modal-card">
            <div className="print-history-modal-title">Ajouter à l'historique</div>
            <form onSubmit={handleManualEntrySubmit}>
              <div className="print-history-modal-grid">
                <label className="form-label">
                  Prénom
                  <input
                    className="input"
                    value={manualFirstName}
                    onChange={(event) => setManualFirstName(event.target.value)}
                  />
                </label>
                <label className="form-label">
                  Nom *
                  <input
                    className="input"
                    value={manualLastName}
                    onChange={(event) => setManualLastName(event.target.value)}
                    required
                  />
                </label>
                <label className="form-label">
                  NIF
                  <input
                    className="input"
                    value={manualNif}
                    onChange={(event) => setManualNif(event.target.value)}
                  />
                </label>
                <label className="form-label">
                  NINU
                  <input
                    className="input"
                    value={manualNinu}
                    onChange={(event) => setManualNinu(event.target.value)}
                  />
                </label>
                <label className="form-label">
                  Poste
                  <input
                    className="input"
                    value={manualPosition}
                    onChange={(event) => setManualPosition(event.target.value)}
                  />
                </label>
              </div>
              {manualError ? <div className="form-error">{manualError}</div> : null}
              <div className="print-history-modal-actions">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setManualEntryOpen(false);
                    setManualError(null);
                  }}
                >
                  Annuler
                </button>
                <button className="btn btn-primary" type="submit">
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

    </div>
  );
}
