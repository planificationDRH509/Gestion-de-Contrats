import { CSSProperties, FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dossier } from "../../data/types";
import {
  getDossierGroups,
  getDossierProgressState,
  isDossierArchived,
  normalizeNonNegativeInteger,
  normalizeOptionalDate
} from "../../lib/dossier";
import {
  useCreateDossier,
  useDeleteDossier,
  useDossierContractMetrics,
  useDossiersList,
  useUpdateDossier
} from "./dossiersApi";

type DossiersInlinePanelProps = {
  workspaceId: string;
  onDossierCreated?: (dossierId: string) => void;
};

export function DossiersInlinePanel({
  workspaceId,
  onDossierCreated
}: DossiersInlinePanelProps) {
  const navigate = useNavigate();
  const { data: dossiers = [], isLoading } = useDossiersList(workspaceId);
  const { data: metricsByDossier = {} } = useDossierContractMetrics(workspaceId);
  const createDossier = useCreateDossier();
  const updateDossier = useUpdateDossier();
  const deleteDossier = useDeleteDossier();

  const [name, setName] = useState("");
  const [isEphemeral, setIsEphemeral] = useState(false);
  const [priority, setPriority] = useState<"normal" | "urgence">("normal");
  const [contractTargetCount, setContractTargetCount] = useState("0");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [comment, setComment] = useState("");
  const [focalPoint, setFocalPoint] = useState("");
  const [roadmapSheetNumber, setRoadmapSheetNumber] = useState("");
  const [defaultDurationMonths, setDefaultDurationMonths] = useState("");

  const [editingDossierId, setEditingDossierId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIsEphemeral, setEditIsEphemeral] = useState(false);
  const [editPriority, setEditPriority] = useState<"normal" | "urgence">("normal");
  const [editStatus, setEditStatus] = useState<"active" | "classified">("active");
  const [editContractTargetCount, setEditContractTargetCount] = useState("0");
  const [editDeadlineDate, setEditDeadlineDate] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editFocalPoint, setEditFocalPoint] = useState("");
  const [editRoadmapSheetNumber, setEditRoadmapSheetNumber] = useState("");
  const [editDefaultDurationMonths, setEditDefaultDurationMonths] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function resetCreateForm() {
    setName("");
    setIsEphemeral(false);
    setPriority("normal");
    setContractTargetCount("0");
    setDeadlineDate("");
    setComment("");
    setFocalPoint("");
    setRoadmapSheetNumber("");
    setDefaultDurationMonths("");
  }

  function startEditing(dossier: Dossier) {
    setEditingDossierId(dossier.id);
    setEditName(dossier.name);
    setEditIsEphemeral(dossier.isEphemeral);
    setEditPriority(dossier.priority ?? "normal");
    setEditStatus(dossier.status ?? "active");
    setEditContractTargetCount(String(dossier.contractTargetCount ?? 0));
    setEditDeadlineDate(dossier.deadlineDate ?? "");
    setEditComment(dossier.comment ?? "");
    setEditFocalPoint(dossier.focalPoint ?? "");
    setEditRoadmapSheetNumber(dossier.roadmapSheetNumber ?? "");
    setEditDefaultDurationMonths(dossier.defaultDurationMonths ? String(dossier.defaultDurationMonths) : "");
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function stopEditing() {
    setEditingDossierId(null);
    setEditName("");
    setEditIsEphemeral(false);
    setEditPriority("normal");
    setEditStatus("active");
    setEditContractTargetCount("0");
    setEditDeadlineDate("");
    setEditComment("");
    setEditFocalPoint("");
    setEditRoadmapSheetNumber("");
    setEditDefaultDurationMonths("");
  }

  function parseTargetCount(raw: string) {
    if (!raw.trim()) {
      return 0;
    }
    return normalizeNonNegativeInteger(Number(raw));
  }

  function formatDate(value?: string | null) {
    if (!value) {
      return "—";
    }
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      return "—";
    }
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("fr-FR");
  }

  function buildRingStyle(doneCount: number, targetCount: number): CSSProperties {
    const progress = getDossierProgressState(doneCount, targetCount);
    const degree =
      progress.tone === "empty"
        ? "22deg"
        : `${Math.max(22, Math.round(progress.ratio * 360))}deg`;

    return {
      ["--dossier-ring-color" as string]: progress.color,
      ["--dossier-ring-degree" as string]: degree
    };
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Le nom du dossier est obligatoire.");
      setSuccessMessage(null);
      return;
    }

    try {
      const dossier = await createDossier.mutateAsync({
        workspaceId,
        name: trimmedName,
        isEphemeral,
        priority,
        contractTargetCount: parseTargetCount(contractTargetCount),
        deadlineDate: normalizeOptionalDate(deadlineDate),
        comment,
        focalPoint,
        roadmapSheetNumber,
        defaultDurationMonths: defaultDurationMonths ? Number(defaultDurationMonths) : null
      });
      resetCreateForm();
      onDossierCreated?.(dossier.id);
      setSuccessMessage(`Dossier "${dossier.name}" prêt.`);
      setErrorMessage(null);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Impossible de créer le dossier.");
      setSuccessMessage(null);
    }
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !editingDossierId) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setErrorMessage("Le nom du dossier est obligatoire.");
      setSuccessMessage(null);
      return;
    }

    try {
      const dossier = await updateDossier.mutateAsync({
        id: editingDossierId,
        workspaceId,
        name: trimmedName,
        isEphemeral: editIsEphemeral,
        priority: editPriority,
        status: editStatus,
        contractTargetCount: parseTargetCount(editContractTargetCount),
        deadlineDate: normalizeOptionalDate(editDeadlineDate),
        comment: editComment,
        focalPoint: editFocalPoint,
        roadmapSheetNumber: editRoadmapSheetNumber,
        defaultDurationMonths: editDefaultDurationMonths ? Number(editDefaultDurationMonths) : null
      });
      setSuccessMessage(`Dossier "${dossier.name}" mis à jour.`);
      setErrorMessage(null);
      stopEditing();
    } catch (error) {
      console.error(error);
      setErrorMessage("Impossible de mettre à jour le dossier.");
      setSuccessMessage(null);
    }
  }

  async function handleSetDossierStatus(dossier: Dossier, status: "active" | "classified") {
    if (!workspaceId) return;

    try {
      const updated = await updateDossier.mutateAsync({
        id: dossier.id,
        workspaceId,
        status
      });
      setSuccessMessage(
        status === "classified"
          ? `Dossier "${updated.name}" classé.`
          : `Dossier "${updated.name}" remis en traitement.`
      );
      setErrorMessage(null);
      if (editingDossierId === dossier.id) {
        setEditStatus(status);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Impossible de modifier le classement du dossier.");
      setSuccessMessage(null);
    }
  }

  async function handleDeleteDossier(dossier: Dossier) {
    if (!workspaceId) return;
    const confirmed = window.confirm(
      `Supprimer le dossier "${dossier.name}" ? Les contrats resteront enregistrés.`
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const unassignedCount = await deleteDossier.mutateAsync({
        id: dossier.id,
        workspaceId
      });
      if (editingDossierId === dossier.id) {
        stopEditing();
      }
      setSuccessMessage(
        `Dossier supprimé. ${unassignedCount} contrat(s) conservé(s) sans dossier.`
      );
    } catch (error) {
      console.error(error);
      setErrorMessage("Impossible de supprimer le dossier.");
    }
  }

  const dossierGroups = getDossierGroups(dossiers);
  const displayedDossiers = [
    ...dossierGroups.active,
    ...dossierGroups.archived,
    ...dossierGroups.classified
  ];

  return (
    <div className="dossiers-inline-panel dossier-modern-shell">
      <form className="card dossier-modern-form-card" onSubmit={handleCreate}>
        <div className="dossier-modern-form-head">
          <div className="section-title">Nouveau dossier</div>
          <div className="helper-text">Planifiez la charge, l'échéance et les notes.</div>
        </div>

        <div className="dossier-modern-form-grid">
          <label className="field">
            <span>Nom du dossier *</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Dossier RH - Avril 2026"
            />
          </label>

          <label className="field">
            <span>Objectif de contrats</span>
            <input
              type="number"
              min={0}
              className="input"
              value={contractTargetCount}
              onChange={(event) => setContractTargetCount(event.target.value)}
              placeholder="0"
            />
          </label>

          <label className="field">
            <span>Durée par défaut (mois)</span>
            <input
              type="number"
              min={1}
              className="input"
              value={defaultDurationMonths}
              onChange={(event) => setDefaultDurationMonths(event.target.value)}
              placeholder="Ex: 12"
            />
          </label>

          <label className="field">
            <span>Dossier éphémère</span>
            <div className="switch">
              <input
                type="checkbox"
                checked={isEphemeral}
                onChange={(event) => setIsEphemeral(event.target.checked)}
              />
              <span className="switch-slider" />
              <span>{isEphemeral ? "Oui" : "Non"}</span>
            </div>
          </label>

          <label className="field">
            <span>Niveau de priorité</span>
            <select
              className="select"
              value={priority}
              onChange={(event) => setPriority(event.target.value as "normal" | "urgence")}
            >
              <option value="normal">Normal</option>
              <option value="urgence">Urgence</option>
            </select>
          </label>

          <label className="field">
            <span>Échéance</span>
            <input
              type="date"
              className="input"
              value={deadlineDate}
              onChange={(event) => setDeadlineDate(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Point focal</span>
            <input
              className="input"
              value={focalPoint}
              onChange={(event) => setFocalPoint(event.target.value)}
              placeholder="Ex: Direction RH"
            />
          </label>

          <label className="field">
            <span># de la feuille de route</span>
            <input
              className="input"
              value={roadmapSheetNumber}
              onChange={(event) => setRoadmapSheetNumber(event.target.value)}
              placeholder="Ex: FR-27"
            />
          </label>

          <label className="field full">
            <span>Commentaire</span>
            <textarea
              className="textarea"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder="Notes et consignes de suivi..."
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={createDossier.isPending}>
            <span className="material-symbols-rounded icon">create_new_folder</span>
            Créer le dossier
          </button>
        </div>

        {errorMessage ? <div className="form-error">{errorMessage}</div> : null}
        {successMessage ? <div className="form-success">{successMessage}</div> : null}
      </form>

      {editingDossierId ? (
        <form className="card dossier-modern-form-card" onSubmit={handleEdit}>
          <div className="dossier-modern-form-head">
            <div className="section-title">Modifier le dossier</div>
            <div className="helper-text">Ajustez l'objectif, l'échéance et les notes.</div>
          </div>

          <div className="dossier-modern-form-grid">
            <label className="field">
              <span>Nom du dossier *</span>
              <input
                className="input"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Objectif de contrats</span>
              <input
                type="number"
                min={0}
                className="input"
                value={editContractTargetCount}
                onChange={(event) => setEditContractTargetCount(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Durée par défaut (mois)</span>
              <input
                type="number"
                min={1}
                className="input"
                value={editDefaultDurationMonths}
                onChange={(event) => setEditDefaultDurationMonths(event.target.value)}
                placeholder="Ex: 12"
              />
            </label>

            <label className="field">
              <span>Dossier éphémère</span>
              <div className="switch">
                <input
                  type="checkbox"
                  checked={editIsEphemeral}
                  onChange={(event) => setEditIsEphemeral(event.target.checked)}
                />
                <span className="switch-slider" />
                <span>{editIsEphemeral ? "Oui" : "Non"}</span>
              </div>
            </label>

            <label className="field">
              <span>Niveau de priorité</span>
              <select
                className="select"
                value={editPriority}
                onChange={(event) => setEditPriority(event.target.value as "normal" | "urgence")}
              >
                <option value="normal">Normal</option>
                <option value="urgence">Urgence</option>
              </select>
            </label>

            <label className="field">
              <span>Classement</span>
              <select
                className="select"
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value as "active" | "classified")}
              >
                <option value="active">En traitement</option>
                <option value="classified">Classé</option>
              </select>
            </label>

            <label className="field">
              <span>Échéance</span>
              <input
                type="date"
                className="input"
                value={editDeadlineDate}
                onChange={(event) => setEditDeadlineDate(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Point focal</span>
              <input
                className="input"
                value={editFocalPoint}
                onChange={(event) => setEditFocalPoint(event.target.value)}
              />
            </label>

            <label className="field">
              <span># de la feuille de route</span>
              <input
                className="input"
                value={editRoadmapSheetNumber}
                onChange={(event) => setEditRoadmapSheetNumber(event.target.value)}
              />
            </label>

            <label className="field full">
              <span>Commentaire</span>
              <textarea
                className="textarea"
                rows={3}
                value={editComment}
                onChange={(event) => setEditComment(event.target.value)}
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={updateDossier.isPending}>
              <span className="material-symbols-rounded icon">save</span>
              Enregistrer
            </button>
            <button className="btn btn-outline" type="button" onClick={stopEditing}>
              <span className="material-symbols-rounded icon">close</span>
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      <div className="dossier-modern-list">
        {isLoading ? (
          <div className="card empty-state">Chargement en cours…</div>
        ) : displayedDossiers.length === 0 ? (
          <div className="card empty-state">Aucun dossier pour le moment.</div>
        ) : (
          displayedDossiers.map((dossier) => {
            const metrics = metricsByDossier[dossier.id] ?? {
              assignedCount: 0,
              doneCount: 0
            };
            const targetCount = Math.max(0, dossier.contractTargetCount);
            const ringStyle = buildRingStyle(metrics.doneCount, dossier.contractTargetCount);
            const dossierIsClassified = dossier.status === "classified";
            const dossierIsArchived = isDossierArchived(dossier);

            return (
              <article key={dossier.id} className="card dossier-modern-card">
                <header className="dossier-modern-card-head">
                  <div className="dossier-modern-progress" style={ringStyle}>
                    <span className="dossier-modern-progress-text">
                      {targetCount > 0
                        ? `${Math.min(metrics.doneCount, targetCount)}/${targetCount}`
                        : String(metrics.doneCount)}
                    </span>
                  </div>

                  <div className="dossier-modern-title-wrap">
                    <h3 className="dossier-modern-title">{dossier.name}</h3>
                    <div className="dossier-modern-subtitle">
                      {metrics.assignedCount} contrat(s) lié(s) · {metrics.doneCount} terminé(s)
                    </div>
                  </div>

                  <div className="icon-actions table-actions-icons">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => startEditing(dossier)}
                      title="Modifier le dossier"
                      aria-label={`Modifier ${dossier.name}`}
                    >
                      <span className="material-symbols-rounded">edit</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => navigate(`/app/contrats/nouveau?dossierId=${dossier.id}`)}
                      title="Créer un contrat dans ce dossier"
                      aria-label={`Créer un contrat dans ${dossier.name}`}
                    >
                      <span className="material-symbols-rounded">note_add</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        void handleSetDossierStatus(
                          dossier,
                          dossierIsClassified ? "active" : "classified"
                        )
                      }
                      disabled={updateDossier.isPending}
                      title={dossierIsClassified ? "Remettre en traitement" : "Classer le dossier"}
                      aria-label={
                        dossierIsClassified
                          ? `Remettre ${dossier.name} en traitement`
                          : `Classer ${dossier.name}`
                      }
                    >
                      <span className="material-symbols-rounded">
                        {dossierIsClassified ? "unarchive" : "archive"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void handleDeleteDossier(dossier)}
                      disabled={deleteDossier.isPending}
                      title="Supprimer le dossier (les contrats sont conservés)"
                      aria-label={`Supprimer ${dossier.name}`}
                    >
                      <span className="material-symbols-rounded">delete</span>
                    </button>
                  </div>
                </header>

                <div className="dossier-modern-chips">
                  <span className="badge">
                    {dossierIsClassified
                      ? "Classé"
                      : dossierIsArchived
                        ? "Archivé"
                        : "En traitement"}
                  </span>
                  <span className="badge">{dossier.isEphemeral ? "Éphémère" : "Permanent"}</span>
                  <span className="badge">{dossier.priority === "urgence" ? "Urgence" : "Normal"}</span>
                  <span className="badge">
                    Objectif: {targetCount}
                  </span>
                </div>

                <div className="dossier-modern-meta">
                  <div>
                    <span className="meta-label">Échéance</span>
                    <span>{formatDate(dossier.deadlineDate)}</span>
                  </div>
                  <div>
                    <span className="meta-label">Point focal</span>
                    <span>{dossier.focalPoint || "—"}</span>
                  </div>
                  <div>
                    <span className="meta-label">Feuille de route</span>
                    <span>{dossier.roadmapSheetNumber || "—"}</span>
                  </div>
                  <div>
                    <span className="meta-label">Durée par défaut</span>
                    <span>{dossier.defaultDurationMonths ? `${dossier.defaultDurationMonths} mois` : "—"}</span>
                  </div>
                </div>

                {dossier.comment ? (
                  <p className="dossier-modern-comment">{dossier.comment}</p>
                ) : (
                  <p className="dossier-modern-comment dossier-modern-comment-muted">
                    Aucun commentaire.
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
