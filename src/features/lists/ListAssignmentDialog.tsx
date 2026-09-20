import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/auth";
import { useContractsByIds } from "../contracts/contractsApi";
import { useContractLists, useListOperation } from "./listsApi";
import { listError, listName, listTotals } from "./listModel";
import { formatCurrency } from "../../lib/format";

type Props = {
  contractIds: string[];
  initialMode?: "assign" | "create";
  onClose: () => void;
};
export function ListAssignmentDialog({ contractIds, initialMode = "assign", onClose }: Props) {
  const { user } = useAuth();
  const listsQuery = useContractLists();
  const contractsQuery = useContractsByIds(contractIds, user?.workspaceId ?? "");
  const operation = useListOperation();
  const [mode, setMode] = useState(initialMode);
  const [target, setTarget] = useState("__choose__");
  const [visa, setVisa] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const lists = listsQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];
  const selectionUnavailable = !contractsQuery.isPending && !contractsQuery.isError
    && (contractIds.length === 0 || contracts.length !== contractIds.length);
  const sourceSealed = lists.some(l => l.sealedAt && l.members.some(m => contractIds.includes(m.id)));
  const ready = !listsQuery.isPending && !contractsQuery.isPending && !listsQuery.isError && !contractsQuery.isError
    && contractIds.length > 0 && contracts.length === contractIds.length;
  const duration = contracts[0]?.durationMonths ?? 0;
  const sameDuration = contracts.length > 0 && contracts.every(c => c.durationMonths === duration);
  const compatible = lists.filter(l => !l.sealedAt && sameDuration && l.durationMonths === duration);
  const preview = { id: "preview", workspaceId: user?.workspaceId ?? "", durationMonths: duration,
    visaNumber: visa, sealedAt: null, version: 1, createdAt: "", history: [],
    members: contracts.map(c => ({ ...c, nif: c.nif ?? "" })) };
  const validDestination = mode === "create" ? sameDuration
    : target === "" || compatible.some(l => l.id === target);
  const canSubmit = ready && !sourceSealed && validDestination && !operation.isPending;
  return <dialog ref={dialog} className="list-dialog" aria-labelledby="list-assignment-title"
    onCancel={e => { e.preventDefault(); if (!operation.isPending) onClose(); }}>
    <form onSubmit={async e => {
      e.preventDefault();
      if (!canSubmit) return;
      try {
        await operation.mutateAsync(mode === "create"
          ? { action: "create", durationMonths: duration, visaNumber: visa.trim(), contractIds }
          : { action: "assign", listId: target || null, contractIds });
        onClose();
      } catch { /* displayed below */ }
    }}>
      <h2 id="list-assignment-title">{mode === "create" ? "Créer une liste avec la sélection" : "Attribuer la sélection à une liste"}</h2>
      <p>{contractIds.length} contrat(s) sélectionné(s){ready && sameDuration ? ` · ${duration} mois` : ""}. Chaque contrat appartient à une seule liste.</p>
      <div className="list-dialog-modes" role="group" aria-label="Action sur la liste">
        <button type="button" aria-pressed={mode === "assign"} disabled={operation.isPending} onClick={() => { setMode("assign"); operation.reset(); }}>Liste existante</button>
        <button type="button" aria-pressed={mode === "create"} disabled={operation.isPending} onClick={() => { setMode("create"); operation.reset(); }}>Nouvelle liste</button>
      </div>
      {!ready && !selectionUnavailable && !listsQuery.error && !contractsQuery.error && <p role="status">Vérification des contrats sélectionnés…</p>}
      {selectionUnavailable && <p role="alert" className="list-error">Certains contrats sélectionnés ne sont plus disponibles. Fermez cette fenêtre et actualisez la sélection.</p>}
      {sourceSealed && <p className="list-notice">Un contrat appartient à une liste scellée. Un administrateur doit d’abord la rouvrir depuis la page Listes.</p>}
      {ready && !sameDuration && <p className="list-notice">La sélection contient des durées différentes. Sélectionnez des contrats de même durée pour les regrouper dans une liste.</p>}
      {mode === "create" ? <>
        {ready && sameDuration && <div className="list-create-preview"><span>Nom automatique du lot</span><strong>{listName(preview)}</strong><small>{formatCurrency(listTotals(preview).total)} HTG sur {duration} mois</small></div>}
        <label className="list-field">Numéro de visa <small>facultatif</small><input className="input" maxLength={120} value={visa} onChange={e => setVisa(e.target.value)} disabled={!ready || sourceSealed || operation.isPending} placeholder="Ex. VISA-2026-001" /></label>
        <p className="helper-text">La nouvelle liste restera en préparation. Les contrats déjà attribués seront déplacés depuis leurs listes actuelles.</p>
      </> : <>
        <label className="list-field">Liste de destination
          <select className="select" value={target} onChange={e => setTarget(e.target.value)} disabled={!ready || sourceSealed || operation.isPending}>
            <option value="__choose__" disabled>Choisir une destination…</option>
            <option value="">Sans liste — retirer de la liste actuelle</option>
            {compatible.map(l => <option key={l.id} value={l.id}>{listName(l)} · {l.durationMonths} mois · {l.visaNumber ? `Visa ${l.visaNumber}` : l.id.slice(0, 8)}</option>)}
          </select>
        </label>
        <p className="helper-text">Seules les listes ouvertes de même durée sont proposées. Le déplacement remplace l’appartenance actuelle.</p>
        {!compatible.length && ready && sameDuration && !sourceSealed && <p>Aucune liste compatible. <button type="button" className="list-inline-action" onClick={() => setMode("create")}>Créer une liste avec cette sélection</button></p>}
      </>}
      {(listsQuery.error || contractsQuery.error || operation.error) && <p role="alert" className="list-error">{listError(operation.error ?? listsQuery.error ?? contractsQuery.error)}</p>}
      <div className="list-actions">
        <button type="button" className="btn btn-outline" onClick={onClose} disabled={operation.isPending}>Annuler</button>
        <button className="btn btn-primary" disabled={!canSubmit}>{operation.isPending ? "Enregistrement…" : mode === "create" ? "Créer et attribuer" : target === "" ? "Retirer de la liste" : "Attribuer à la liste"}</button>
      </div>
    </form>
  </dialog>;
}
