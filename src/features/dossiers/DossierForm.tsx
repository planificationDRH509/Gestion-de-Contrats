import { FormEvent, useState } from "react";
import { Dossier } from "../../data/types";
import { useCreateDossier, useUpdateDossier } from "./dossiersApi";
import { DossierDialog } from "./DossierDialog";

export function DossierForm({ workspaceId, dossier, onClose, onSaved }: {
  workspaceId: string;
  dossier?: Dossier;
  onClose: () => void;
  onSaved: (dossier: Dossier) => void;
}) {
  const create = useCreateDossier();
  const update = useUpdateDossier();
  const busy = create.isPending || update.isPending;
  const [name, setName] = useState(dossier?.name ?? "");
  const [deadline, setDeadline] = useState(dossier?.deadlineDate ?? "");
  const [priority, setPriority] = useState(dossier?.priority ?? "normal");
  const [target, setTarget] = useState(String(dossier?.contractTargetCount || ""));
  const [duration, setDuration] = useState(String(dossier?.defaultDurationMonths || ""));
  const [focalPoint, setFocalPoint] = useState(dossier?.focalPoint ?? "");
  const [roadmap, setRoadmap] = useState(dossier?.roadmapSheetNumber ?? "");
  const [comment, setComment] = useState(dossier?.comment ?? "");
  const [ephemeral, setEphemeral] = useState(dossier?.isEphemeral ?? false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !workspaceId) return;
    if (!name.trim()) { setError("Le nom du dossier est obligatoire."); return; }
    setError("");
    const input = {
      workspaceId, name: name.trim(), deadlineDate: deadline || null, priority,
      contractTargetCount: Number(target) || 0, defaultDurationMonths: duration ? Number(duration) : null,
      focalPoint: focalPoint.trim() || null, roadmapSheetNumber: roadmap.trim() || null,
      comment: comment.trim() || null, isEphemeral: ephemeral
    };
    try {
      const saved = dossier ? await update.mutateAsync({ ...input, id: dossier.id }) : await create.mutateAsync(input);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer le dossier.");
    }
  }

  return <DossierDialog title={dossier ? "Modifier le dossier" : "Nouveau dossier"} onClose={onClose} busy={busy}>
    <form onSubmit={submit}>
      <fieldset className="dossiers-form-body" disabled={busy}>
        <label className="dossiers-field dossiers-field-full">Nom du dossier
          <input className="input" data-autofocus required value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="dossiers-field">Échéance
          <input className="input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </label>
        <label className="dossiers-field">Priorité
          <select className="select" value={priority} onChange={e => setPriority(e.target.value as Dossier["priority"])}>
            <option value="normal">Normale</option><option value="urgence">Urgente</option>
          </select>
        </label>
        <details className="dossiers-form-options dossiers-field-full" open={dossier ? true : undefined}>
          <summary>Planification et détails <span className="material-symbols-rounded" aria-hidden="true">expand_more</span></summary>
          <div className="dossiers-form-grid">
            <label className="dossiers-field">Objectif de contrats
              <input className="input" type="number" min="0" step="1" value={target} onChange={e => setTarget(e.target.value)} />
            </label>
            <label className="dossiers-field">Durée par défaut (mois)
              <input className="input" type="number" min="1" step="1" value={duration} onChange={e => setDuration(e.target.value)} />
            </label>
            <label className="dossiers-field">Point focal
              <input className="input" value={focalPoint} onChange={e => setFocalPoint(e.target.value)} />
            </label>
            <label className="dossiers-field">Feuille de route
              <input className="input" value={roadmap} onChange={e => setRoadmap(e.target.value)} />
            </label>
            <label className="dossiers-field dossiers-field-full">Commentaire
              <textarea className="textarea" rows={3} value={comment} onChange={e => setComment(e.target.value)} />
            </label>
            <label className="dossiers-checkbox dossiers-field-full">
              <input type="checkbox" checked={ephemeral} onChange={e => setEphemeral(e.target.checked)} /> Dossier éphémère
            </label>
          </div>
        </details>
        {error && <p className="dossiers-error dossiers-field-full" role="alert">{error}</p>}
      </fieldset>
      <footer className="dossiers-dialog-footer">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !workspaceId}>
          {busy ? "Enregistrement…" : dossier ? "Enregistrer" : "Créer le dossier"}
        </button>
      </footer>
    </form>
  </DossierDialog>;
}
