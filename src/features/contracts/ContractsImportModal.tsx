import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import type { AppUser, Contract, Dossier } from "../../data/types";
import {
  CONTRACT_IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  buildImportEditableRows,
  getImportFieldLabel,
  inferImportMapping,
  parsePastedContractTable,
  validateImportMapping,
  validateImportEditableRows,
  type ContractImportEditableField,
  type ContractImportEditableRow,
  type ContractImportFieldId,
  type ContractImportMapping
} from "./contractImport";
import {
  clearContractImportDraft,
  loadContractImportDraft,
  saveContractImportDraft
} from "./contractImportDraft";
import { useImportContracts, type ContractImportProgress } from "./contractsApi";

type UserOption = {
  id: string;
  label: string;
};

const BULK_EDIT_FIELDS: { id: ContractImportEditableField; label: string }[] = [
  { id: "gender", label: "Sexe" },
  { id: "address", label: "Adresse" },
  { id: "salaryNumber", label: "Salaire" },
  { id: "salaryText", label: "Salaire en lettres" },
  { id: "position", label: "Poste" },
  { id: "assignment", label: "Affectation" },
  { id: "durationMonths", label: "Durée" },
  { id: "commentaire", label: "Commentaire" }
];

const IMPORT_PREVIEW_PAGE_SIZE = 50;

type ContractsImportModalProps = {
  isOpen: boolean;
  workspaceId: string;
  currentUserId: string;
  currentUserName: string;
  dossiers: Dossier[];
  appUsers: AppUser[];
  existingContracts: Contract[];
  onClose: () => void;
  onImported: (count: number) => void;
};

export function ContractsImportModal({
  isOpen,
  workspaceId,
  currentUserId,
  currentUserName,
  dossiers,
  appUsers,
  existingContracts,
  onClose,
  onImported
}: ContractsImportModalProps) {
  const [clipboardText, setClipboardText] = useState("");
  const [mapping, setMapping] = useState<ContractImportMapping>([]);
  const [editableRows, setEditableRows] = useState<ContractImportEditableRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkField, setBulkField] = useState<ContractImportEditableField>("assignment");
  const [bulkValue, setBulkValue] = useState("");
  const [selectedDossierId, setSelectedDossierId] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState(currentUserId);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ContractImportProgress | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const restoringRef = useRef(false);
  const hydratedClipboardSignatureRef = useRef<string | null>(null);
  const importContracts = useImportContracts();

  const table = useMemo(() => parsePastedContractTable(clipboardText), [clipboardText]);
  const headerSignature = table.headers.join("\u001f");
  const clipboardSignature = clipboardText;

  useEffect(() => {
    if (!isOpen) return;
    restoringRef.current = true;
    const draft = loadContractImportDraft(workspaceId, currentUserId);
    if (draft) {
      setClipboardText(draft.clipboardText);
      setMapping(draft.mapping);
      setEditableRows(draft.editableRows);
      setSelectedRowIds(draft.selectedRowIds);
      setBulkField(draft.bulkField);
      setBulkValue(draft.bulkValue);
      setSelectedDossierId(draft.selectedDossierId);
      setResponsibleUserId(draft.responsibleUserId || currentUserId);
    } else {
      setClipboardText("");
      setMapping([]);
      setEditableRows([]);
      setSelectedRowIds([]);
      setBulkField("assignment");
      setBulkValue("");
      setSelectedDossierId("");
      setResponsibleUserId(currentUserId);
    }
    setImportError(null);
    setImportProgress(null);
    setPreviewPage(1);
    hydratedClipboardSignatureRef.current = draft?.clipboardText ?? "";
    restoreTimerRef.current = window.setTimeout(() => {
      pasteRef.current?.focus();
      restoringRef.current = false;
    }, 0);
    return () => {
      if (restoreTimerRef.current) {
        window.clearTimeout(restoreTimerRef.current);
      }
      restoringRef.current = false;
    };
  }, [currentUserId, isOpen, workspaceId]);

  useEffect(() => {
    if (!isOpen || table.headers.length === 0) return;
    if (hydratedClipboardSignatureRef.current === clipboardSignature) return;
    setMapping(inferImportMapping(table.headers));
    hydratedClipboardSignatureRef.current = clipboardSignature;
  }, [clipboardSignature, headerSignature, isOpen, table.headers]);

  useEffect(() => {
    if (!isOpen || table.rows.length === 0 || mapping.length === 0) {
      setEditableRows([]);
      setSelectedRowIds([]);
      return;
    }
    const rows = buildImportEditableRows(table, mapping).slice(0, MAX_IMPORT_ROWS);
    setEditableRows(rows);
    setSelectedRowIds(rows.map((row) => row.id));
    setPreviewPage(1);
  }, [isOpen, mapping, table]);

  useEffect(() => {
    if (!isOpen || restoringRef.current) return;
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      saveContractImportDraft(workspaceId, currentUserId, {
        clipboardText,
        mapping,
        editableRows,
        selectedRowIds,
        bulkField,
        bulkValue,
        selectedDossierId,
        responsibleUserId
      });
    }, 300);
    return () => {
      if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    };
  }, [
    clipboardText,
    currentUserId,
    editableRows,
    isOpen,
    mapping,
    responsibleUserId,
    selectedDossierId,
    selectedRowIds,
    bulkField,
    bulkValue,
    workspaceId
  ]);

  const userOptions = useMemo<UserOption[]>(() => {
    const options = appUsers
      .map((appUser) => ({ id: appUser.id, label: appUser.fullName || appUser.username }));
    if (!options.some((option) => option.id === currentUserId)) {
      options.unshift({ id: currentUserId, label: currentUserName });
    }
    return options;
  }, [appUsers, currentUserId, currentUserName]);

  const existingNifs = useMemo(
    () => existingContracts.map((contract) => contract.nif ?? "").filter(Boolean),
    [existingContracts]
  );
  const mappingIssues = useMemo(() => validateImportMapping(mapping), [mapping]);
  const validatedRows = useMemo(
    () => validateImportEditableRows(editableRows, { existingNifs }),
    [editableRows, existingNifs]
  );
  const validationById = useMemo(
    () => new Map(validatedRows.map((row) => [row.id, row])),
    [validatedRows]
  );
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const includedRows = validatedRows.filter((row) => !row.excluded);
  const validRows = includedRows.filter((row) => row.values && row.errors.length === 0);
  const selectedRows = validatedRows.filter(
    (row) => selectedRowIdSet.has(row.id) && !row.excluded
  );
  const selectedValidRows = selectedRows.filter((row) => row.values && row.errors.length === 0);
  const selectedErrorRowCount = selectedRows.filter((row) => row.errors.length > 0).length;
  const errorRowCount = includedRows.filter((row) => row.errors.length > 0).length;
  const warningRowCount = includedRows.filter((row) => row.warnings.length > 0).length;
  const excludedRowCount = validatedRows.filter((row) => row.excluded).length;
  const problemRowIds = useMemo(
    () =>
      new Set(
        validatedRows
          .filter((row) => !row.excluded && (row.errors.length > 0 || row.warnings.length > 0))
          .map((row) => row.id)
      ),
    [validatedRows]
  );
  const allRowsSelected =
    editableRows.length > 0 && editableRows.every((row) => selectedRowIdSet.has(row.id));
  const isOverflow = table.rows.length > MAX_IMPORT_ROWS;
  const totalPreviewPages = Math.max(1, Math.ceil(editableRows.length / IMPORT_PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, totalPreviewPages);
  const previewStart = (safePreviewPage - 1) * IMPORT_PREVIEW_PAGE_SIZE;
  const visibleEditableRows = editableRows.slice(
    previewStart,
    previewStart + IMPORT_PREVIEW_PAGE_SIZE
  );
  const canImport =
    selectedValidRows.length > 0 &&
    Boolean(selectedDossierId) &&
    Boolean(responsibleUserId) &&
    mappingIssues.missingFields.length === 0 &&
    mappingIssues.duplicateFields.length === 0 &&
    selectedErrorRowCount === 0 &&
    !isOverflow &&
    !importContracts.isPending;

  useEffect(() => {
    if (previewPage > totalPreviewPages) setPreviewPage(totalPreviewPages);
  }, [previewPage, totalPreviewPages]);

  const importProgressLabel = importProgress
    ? importProgress.phase === "applicants"
      ? `Préparation ${importProgress.completed}/${importProgress.total}`
      : `Importation ${importProgress.completed}/${importProgress.total}`
    : null;

  if (!isOpen) return null;

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    setClipboardText(text);
  }

  function handleMappingChange(index: number, field: ContractImportFieldId) {
    setMapping((prev) => {
      const next = [...prev];
      next[index] = field;
      return next;
    });
  }

  function updateEditableRow(rowId: string, field: ContractImportEditableField, value: string) {
    setEditableRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  }

  function toggleAllRowsSelection() {
    setSelectedRowIds(allRowsSelected ? [] : editableRows.map((row) => row.id));
  }

  function applyBulkValue(scope: "selected" | "all") {
    const targetIds = scope === "selected" ? new Set(selectedRowIds) : null;
    setEditableRows((prev) =>
      prev.map((row) => {
        if (targetIds && !targetIds.has(row.id)) return row;
        return { ...row, [bulkField]: bulkValue };
      })
    );
  }

  function setSelectedRowsExcluded(excluded: boolean) {
    const targetIds = new Set(selectedRowIds);
    setEditableRows((prev) =>
      prev.map((row) => (targetIds.has(row.id) ? { ...row, excluded } : row))
    );
  }

  function selectProblemRows() {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      problemRowIds.forEach((rowId) => next.add(rowId));
      return Array.from(next);
    });
    const firstProblemIndex = editableRows.findIndex((row) => problemRowIds.has(row.id));
    if (firstProblemIndex >= 0) {
      setPreviewPage(Math.floor(firstProblemIndex / IMPORT_PREVIEW_PAGE_SIZE) + 1);
    }
  }

  function closeModal() {
    if (importContracts.isPending) return;
    saveContractImportDraft(workspaceId, currentUserId, {
      clipboardText,
      mapping,
      editableRows,
      selectedRowIds,
      bulkField,
      bulkValue,
      selectedDossierId,
      responsibleUserId
    });
    onClose();
  }

  async function handleImport() {
    setImportError(null);
    setImportProgress(null);
    if (!selectedDossierId) {
      setImportError("Sélectionnez un dossier avant l'enregistrement.");
      return;
    }
    if (isOverflow) {
      setImportError(`Cet import dépasse la limite de sécurité de ${MAX_IMPORT_ROWS} lignes. Divisez-le en plusieurs lots.`);
      return;
    }
    if (
      mappingIssues.missingFields.length > 0 ||
      mappingIssues.duplicateFields.length > 0 ||
      selectedErrorRowCount > 0
    ) {
      setImportError("Corrigez le mapping ou les lignes sélectionnées invalides avant l'enregistrement.");
      return;
    }

    try {
      const createdContracts = await importContracts.mutateAsync({
        workspaceId,
        dossierId: selectedDossierId,
        responsibleUserId,
        rows: selectedValidRows.map((row) => row.values!),
        onProgress: setImportProgress
      });
      onImported(createdContracts.length);
      clearContractImportDraft(workspaceId, currentUserId);
      onClose();
    } catch (error) {
      console.error(error);
      setImportProgress(null);
      setImportError(error instanceof Error ? error.message : "Impossible d'importer les contrats.");
    }
  }

  return (
    <div className="contracts-import-modal" role="dialog" aria-modal="true" aria-labelledby="contracts-import-title">
      <div className="contracts-import-modal-card">
        <div className="contracts-import-modal-head">
          <div>
            <div id="contracts-import-title" className="contracts-import-modal-title">
              Importer depuis Excel
            </div>
            <div className="contracts-import-modal-subtitle">
              {table.rows.length > 0
                ? `${table.rows.length} ligne(s), ${table.headers.length} colonne(s)`
                : "Collage Excel"}
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={closeModal} title="Fermer">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <textarea
          ref={pasteRef}
          className="textarea contracts-import-paste"
          value={clipboardText}
          onPaste={handlePaste}
          onChange={(event) => setClipboardText(event.target.value)}
          placeholder="Collez les lignes copiées depuis Excel"
        />

        {table.headers.length > 0 ? (
          <>
            <div className="contracts-import-meta-grid">
              <label className="form-label">
                Dossier *
                <select
                  className="select"
                  value={selectedDossierId}
                  onChange={(event) => setSelectedDossierId(event.target.value)}
                >
                  <option value="">Sélectionner un dossier</option>
                  {dossiers.map((dossier) => (
                    <option key={dossier.id} value={dossier.id}>
                      {dossier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Responsable
                <select
                  className="select"
                  value={responsibleUserId}
                  onChange={(event) => setResponsibleUserId(event.target.value)}
                >
                  {userOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="contracts-import-status-row">
              <span>{validRows.length} prête(s)</span>
              <span>{selectedValidRows.length} sélectionnée(s)</span>
              <span>{errorRowCount} erreur(s)</span>
              <span>{warningRowCount} alerte(s)</span>
              <span>{excludedRowCount} retirée(s)</span>
              {isOverflow ? <span>Maximum {MAX_IMPORT_ROWS} lignes</span> : null}
              {importProgressLabel ? <span>{importProgressLabel}</span> : null}
            </div>

            {isOverflow ? (
              <div className="form-error">
                Le collage contient {table.rows.length} lignes. Pour éviter un import partiel, conservez au maximum{" "}
                {MAX_IMPORT_ROWS} lignes par lot.
              </div>
            ) : null}

            {mappingIssues.missingFields.length > 0 ? (
              <div className="form-error">
                Colonnes requises manquantes:{" "}
                {mappingIssues.missingFields.map(getImportFieldLabel).join(", ")}.
              </div>
            ) : null}
            {mappingIssues.duplicateFields.length > 0 ? (
              <div className="form-error">
                Colonnes associées plusieurs fois:{" "}
                {mappingIssues.duplicateFields.map(getImportFieldLabel).join(", ")}.
              </div>
            ) : null}

            <div className="contracts-import-section-title">Correspondance des colonnes</div>
            <div className="contracts-import-mapping">
              {table.headers.map((header, index) => (
                <div className="contracts-import-mapping-row" key={`${header}-${index}`}>
                  <div className="contracts-import-source">
                    <span>{header}</span>
                    <small>{table.rows[0]?.[index]?.trim() || "Vide"}</small>
                  </div>
                  <select
                    className="select"
                    value={mapping[index] ?? "ignore"}
                    onChange={(event) =>
                      handleMappingChange(index, event.target.value as ContractImportFieldId)
                    }
                  >
                    {CONTRACT_IMPORT_FIELDS.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="contracts-import-section-title">Inspection et modifications</div>
            <div className="contracts-import-bulkbar">
              <label className="contracts-import-bulk-control">
                Champ
                <select
                  className="select"
                  value={bulkField}
                  onChange={(event) => setBulkField(event.target.value as ContractImportEditableField)}
                >
                  {BULK_EDIT_FIELDS.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="contracts-import-bulk-control">
                Valeur
                {bulkField === "gender" ? (
                  <select className="select" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                    <option value="">Choisir</option>
                    <option value="Homme">Homme</option>
                    <option value="Femme">Femme</option>
                  </select>
                ) : (
                  <input
                    className="input"
                    value={bulkValue}
                    onChange={(event) => setBulkValue(event.target.value)}
                  />
                )}
              </label>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => applyBulkValue("selected")}
                disabled={selectedRowIds.length === 0}
              >
                Appliquer à la sélection
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => applyBulkValue("all")}
                disabled={editableRows.length === 0}
              >
                Appliquer à tout
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setSelectedRowsExcluded(true)}
                disabled={selectedRowIds.length === 0}
              >
                Retirer sélection
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setSelectedRowsExcluded(false)}
                disabled={selectedRowIds.length === 0}
              >
                Réintégrer
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={selectProblemRows}
                disabled={problemRowIds.size === 0}
              >
                Sélectionner alertes / erreurs
              </button>
            </div>
            <div className="contracts-import-preview">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={allRowsSelected}
                        onChange={toggleAllRowsSelection}
                        aria-label="Sélectionner toutes les lignes importées"
                      />
                    </th>
                    <th>Ligne</th>
                    <th>NIF</th>
                    <th>NINU</th>
                    <th>Nom</th>
                    <th>Prénom</th>
                    <th>Sexe</th>
                    <th>Adresse</th>
                    <th>Salaire</th>
                    <th>Salaire lettres</th>
                    <th>Poste</th>
                    <th>Affectation</th>
                    <th>Durée</th>
                    <th>Commentaire</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEditableRows.map((row) => {
                    const validation = validationById.get(row.id);
                    const stateClass = row.excluded
                      ? "excluded"
                      : validation?.errors.length
                        ? "invalid"
                        : validation?.warnings.length
                          ? "warning"
                          : "";
                    return (
                      <tr key={row.id} className={stateClass}>
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={selectedRowIdSet.has(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                            aria-label={`Sélectionner la ligne ${row.sourceRowNumber}`}
                          />
                        </td>
                        <td>{row.sourceRowNumber}</td>
                        <td>
                          <input
                            className="contracts-import-cell-input"
                            value={row.nif}
                            onChange={(event) => updateEditableRow(row.id, "nif", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input"
                            value={row.ninu}
                            onChange={(event) => updateEditableRow(row.id, "ninu", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input"
                            value={row.lastName}
                            onChange={(event) => updateEditableRow(row.id, "lastName", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input"
                            value={row.firstName}
                            onChange={(event) => updateEditableRow(row.id, "firstName", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <select
                            className="contracts-import-cell-input"
                            value={row.gender}
                            onChange={(event) => updateEditableRow(row.id, "gender", event.target.value)}
                            disabled={row.excluded}
                          >
                            <option value={row.gender && row.gender !== "Homme" && row.gender !== "Femme" ? row.gender : ""}>
                              {row.gender && row.gender !== "Homme" && row.gender !== "Femme" ? row.gender : "Choisir"}
                            </option>
                            <option value="Homme">Homme</option>
                            <option value="Femme">Femme</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input wide"
                            value={row.address}
                            onChange={(event) => updateEditableRow(row.id, "address", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input number"
                            value={row.salaryNumber}
                            onChange={(event) => updateEditableRow(row.id, "salaryNumber", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input wide"
                            value={row.salaryText}
                            onChange={(event) => updateEditableRow(row.id, "salaryText", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input"
                            value={row.position}
                            onChange={(event) => updateEditableRow(row.id, "position", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input wide"
                            value={row.assignment}
                            onChange={(event) => updateEditableRow(row.id, "assignment", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input number"
                            value={row.durationMonths}
                            onChange={(event) => updateEditableRow(row.id, "durationMonths", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td>
                          <input
                            className="contracts-import-cell-input wide"
                            value={row.commentaire}
                            onChange={(event) => updateEditableRow(row.id, "commentaire", event.target.value)}
                            disabled={row.excluded}
                          />
                        </td>
                        <td className="contracts-import-row-state">
                          {row.excluded
                            ? "Retirée"
                            : validation?.errors.concat(validation.warnings).join(" ") || "Valide"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editableRows.length > IMPORT_PREVIEW_PAGE_SIZE ? (
              <div className="contracts-import-preview-pagination">
                <span>
                  Lignes {previewStart + 1}–{Math.min(previewStart + IMPORT_PREVIEW_PAGE_SIZE, editableRows.length)} sur{" "}
                  {editableRows.length}
                </span>
                <div>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setPreviewPage((page) => Math.max(1, page - 1))}
                    disabled={safePreviewPage <= 1}
                  >
                    Précédent
                  </button>
                  <span>Page {safePreviewPage} / {totalPreviewPages}</span>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setPreviewPage((page) => Math.min(totalPreviewPages, page + 1))}
                    disabled={safePreviewPage >= totalPreviewPages}
                  >
                    Suivant
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {importError ? <div className="form-error">{importError}</div> : null}

        <div className="contracts-import-actions">
          <button className="btn btn-outline" type="button" onClick={closeModal} disabled={importContracts.isPending}>
            Annuler
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void handleImport()} disabled={!canImport}>
            {importContracts.isPending ? importProgressLabel ?? "Importation..." : `Importer ${selectedValidRows.length} contrat(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
