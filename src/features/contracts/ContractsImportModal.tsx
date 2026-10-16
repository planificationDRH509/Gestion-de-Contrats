import { loadImportBatches, type ImportBatch } from "./contractImportBatch";
import { contractMandateWarning } from "./ContractMandateAlert";
import { useMinisters } from "../settings/ministersApi";
import { findContractMinister } from "../../lib/ministers";
import "./contractsImport.css";
import { createPortal } from "react-dom";
import { confirmImportReceipt, readImportRequest } from "./contractImportRun";
import { readSkippedContractIds } from "../../data/local/skipDuplicateContract";
import { createId } from "../../lib/uuid";
import { DossierSelectOptions } from "../dossiers/DossierSelectOptions";
import { useSalaryGrid } from "../salary-grid/salaryGridApi";
import { genderedTitle, salaryOutsideGrid } from "../salary-grid/salaryGrid";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import { Fragment, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import type { AppUser, Contract, Dossier } from "../../data/types";
import {
  CONTRACT_IMPORT_FIELDS,
  findImportDuplicate,
  resolveImportRows,
  getImportErrorFields,
  MAX_IMPORT_ROWS,
  buildImportEditableRows,
  getImportFieldLabel,
  getImportDifferences,
  inferImportMapping,
  parsePastedContractTable,
  parseImportMoney,
  validateImportMapping,
  validateImportEditableRows,
  type ContractImportEditableField,
  type ContractImportEditableRow,
  type ContractImportFieldId,
  type ContractImportMapping
} from "./contractImport";
import {
  loadContractImportDraft,
  saveContractImportDraft,
  loadImportMapping,
  saveImportMapping
} from "./contractImportDraft";
import {
  useImportApplicantMatches,
  useImportContractHistory,
  useImportContracts,
  useUndoContractImport,
  type ContractImportProgress
} from "./contractsApi";
import { useFiscalYear } from "../settings/settingsApi";
import { isPastFiscalYear } from "../../lib/contractDateFilters";

type UserOption = {
  id: string;
  label: string;
};

const BULK_EDIT_FIELDS: { id: ContractImportEditableField; label: string }[] = [
  { id: "gender", label: "Sexe" },
  { id: "address", label: "Adresse" },
  { id: "phone", label: "Téléphone" },
  { id: "salaryNumber", label: "Salaire" },
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
  onClose,
  onImported
}: ContractsImportModalProps) {
  const { entries: salaryGrid, data: salaryGridData } = useSalaryGrid();
  const [batchId, setBatchId] = useState(() => createId());
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [undoBatchId, setUndoBatchId] = useState("");
  const undoImport = useUndoContractImport();
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
  const [viewFilter, setViewFilter] = useState<"all" | "remaining" | "errors" | "differences" | "imported">("all");
  const [sourceOpen, setSourceOpen] = useState(true);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const [importFiscalYear, setImportFiscalYear] = useState("");
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const restoringRef = useRef(false);

  const importContracts = useImportContracts();
  const busy = importContracts.isPending || undoImport.isPending;
  const { fiscalYear } = useFiscalYear();
  const { registry: ministerRegistry } = useMinisters();
  const currentMinister = ministerRegistry?.ministers.find(minister => minister.id === ministerRegistry.currentMinisterId);
  const targetFiscalYear = importFiscalYear || fiscalYear;
  const fiscalYearIsPast = isPastFiscalYear(targetFiscalYear);

  const table = useMemo(() => parsePastedContractTable(clipboardText), [clipboardText]);
  const draftSnapshot = { clipboardText, mapping, editableRows, selectedRowIds, bulkField, bulkValue,
    selectedDossierId, responsibleUserId, fiscalYear: targetFiscalYear, batchId };
  const draftRef = useRef(draftSnapshot);
  draftRef.current = draftSnapshot;

  function persistDraft(snapshot = draftRef.current) {
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftRef.current = snapshot;
    const saved = saveContractImportDraft(workspaceId, currentUserId, snapshot);
    if (!saved) setImportError("Impossible de sauvegarder le brouillon. Libérez de l’espace avant l’import.");
    return saved;
  }

  useEffect(() => {
    if (!isOpen) return;
    restoringRef.current = true;
    const draft = loadContractImportDraft(workspaceId, currentUserId);
    const savedBatches = loadImportBatches(workspaceId, currentUserId);
    const undoneRows = new Set(savedBatches.flatMap(batch => batch.entries.filter(entry => entry.undone).map(entry => entry.rowId)));
    if (draft) {
      setClipboardText(draft.clipboardText);
      setMapping(draft.mapping);
      setEditableRows((draft.editableRows.length ? draft.editableRows : buildImportEditableRows(parsePastedContractTable(draft.clipboardText), draft.mapping))
        .map(row => row.contractId && undoneRows.has(row.contractId)
          ? { ...row, contractId: createId(), importedContractId: undefined, importError: undefined, duplicateResolution: undefined }
          : { ...row, contractId: row.contractId || createId() }));
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
    setBatchId(draft?.batchId || createId());
    setBatches(savedBatches);
    setUndoBatchId(savedBatches.find(batch => batch.entries.some(entry => entry.after && !entry.undone))?.id ?? "");
    setImportFiscalYear(draft?.fiscalYear || fiscalYear);
    setViewFilter(draft?.editableRows.some(row => row.importedContractId) ? "remaining" : "all");
    setActiveRowId(null);
    setSourceOpen(!draft?.clipboardText);
    setImportError(null);
    setImportProgress(null);
    setPreviewPage(1);
    restoreTimerRef.current = window.setTimeout(() => {
      if (!draft?.clipboardText) pasteRef.current?.focus();
      else dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
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
    if (!isOpen || restoringRef.current) return;
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      persistDraft();
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
    workspaceId,
    targetFiscalYear,
    batchId
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const reconcile = () => {
      const skipped = readSkippedContractIds(workspaceId);
      setEditableRows(rows => rows.some(row => row.contractId && skipped.has(row.contractId) && (!row.excluded || row.importedContractId || row.importError))
        ? rows.map(row => row.contractId && skipped.has(row.contractId)
          ? { ...row, excluded: true, importedContractId: undefined, importError: undefined } : row)
        : rows);
    };
    reconcile();
    window.addEventListener("contribution-offline-sync", reconcile);
    return () => window.removeEventListener("contribution-offline-sync", reconcile);
  }, [isOpen, workspaceId]);

  useEffect(() => {
    if (!isOpen) return;
    const save = () => { if (!restoringRef.current) persistDraft(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { save(); window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", onVisibility); };
  }, [isOpen, workspaceId, currentUserId]);

  const userOptions = useMemo<UserOption[]>(() => {
    const options = appUsers
      .map((appUser) => ({ id: appUser.id, label: appUser.fullName || appUser.username }));
    if (!options.some((option) => option.id === currentUserId)) {
      options.unshift({ id: currentUserId, label: currentUserName });
    }
    return options;
  }, [appUsers, currentUserId, currentUserName]);

  const importIdentityKeys = useMemo(() => {
    const nifs = new Set<string>();
    const ninus = new Set<string>();
    editableRows.forEach((row) => {
      if (row.excluded) return;
      const nifDigits = row.nif.replace(/\D/g, "");
      const ninuDigits = row.ninu.replace(/\D/g, "");
      if (nifDigits.length === 10) {
        nifs.add(
          `${nifDigits.slice(0, 3)}-${nifDigits.slice(3, 6)}-${nifDigits.slice(6, 9)}-${nifDigits.slice(9)}`
        );
      }
      if (ninuDigits.length === 10) ninus.add(ninuDigits);
    });
    return {
      nifs: Array.from(nifs).sort(),
      ninus: Array.from(ninus).sort()
    };
  }, [editableRows]);
  const identityCheckEnabled =
    isOpen && (importIdentityKeys.nifs.length > 0 || importIdentityKeys.ninus.length > 0);
  const identityMatches = useImportApplicantMatches(
    workspaceId,
    importIdentityKeys.nifs,
    importIdentityKeys.ninus,
    identityCheckEnabled
  );
  const history = useImportContractHistory(workspaceId, identityCheckEnabled);
  const isCheckingIdentities = identityCheckEnabled &&
    (identityMatches.isPending || identityMatches.isFetching || history.isPending || history.isFetching);
  const resolvedRows = useMemo(
    () => resolveImportRows(editableRows, identityMatches.data ?? [], history.data ?? []),
    [editableRows, identityMatches.data, history.data]
  );
  const mappingIssues = useMemo(() => validateImportMapping(mapping), [mapping]);
  const validatedRows = useMemo(
    () =>
      validateImportEditableRows(resolvedRows, {
        existingContracts: history.data ?? [],
        fiscalYear: targetFiscalYear,
        selectedRowIds,
        existingApplicants: identityMatches.data ?? []
      }),
    [resolvedRows, history.data, identityMatches.data, targetFiscalYear, selectedRowIds]
  );
  const differencesById = useMemo(
    () => getImportDifferences(resolvedRows, identityMatches.data ?? [], history.data ?? []),
    [resolvedRows, identityMatches.data, history.data]
  );
  const validationById = useMemo(
    () => new Map(validatedRows.map((row) => [row.id, row])),
    [validatedRows]
  );
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const hasAttempt = (row: ContractImportEditableRow) => Boolean(row.contractId && readImportRequest(workspaceId, row.contractId));
  const completedIds = new Set(editableRows.filter(row => row.importedContractId).map(row => row.id));
  const includedRows = validatedRows.filter((row) => !row.excluded && !row.skipped && !completedIds.has(row.id));
  const selectedRows = validatedRows.filter(
    (row) => selectedRowIdSet.has(row.id) && !row.excluded && !row.skipped && !completedIds.has(row.id)
  );
  const selectedValidRows = selectedRows.filter((row) => row.values && row.errors.length === 0);
  const errorRowCount = includedRows.filter((row) => row.errors.length > 0 || editableRows.find(item => item.id === row.id)?.importError).length;
  const errorRowIds = useMemo(
    () =>
      new Set(
        validatedRows
          .filter((row) => !row.excluded && !row.skipped && !completedIds.has(row.id) && (row.errors.length > 0 || editableRows.find(item => item.id === row.id)?.importError))
          .map((row) => row.id)
      ),
    [validatedRows, editableRows]
  );
  const isOverflow = table.rows.length > MAX_IMPORT_ROWS;
  const differenceRowIds = new Set(resolvedRows.filter(row => !row.excluded && !row.importedContractId && (differencesById.get(row.id)?.length ?? 0) > 0).map(row => row.id));
  const previewRows = resolvedRows.filter(row => viewFilter === "all" ||
    (viewFilter === "remaining" && !row.importedContractId && !row.excluded && !validationById.get(row.id)?.skipped) ||
    (viewFilter === "errors" && errorRowIds.has(row.id)) ||
    (viewFilter === "differences" && differenceRowIds.has(row.id)) ||
    (viewFilter === "imported" && completedIds.has(row.id)));
  const selectablePreviewRows = previewRows.filter(row => !row.importedContractId);
  const allRowsSelected = selectablePreviewRows.length > 0 && selectablePreviewRows.every(row => selectedRowIdSet.has(row.id));
  const activeRow = resolvedRows.find(row => row.id === activeRowId);
  const activeDifferences = activeRow ? differencesById.get(activeRow.id) ?? [] : [];
  const selectedPendingRows = editableRows.filter(row => selectedRowIdSet.has(row.id) && !row.importedContractId);
  const totalPreviewPages = Math.max(1, Math.ceil(previewRows.length / IMPORT_PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, totalPreviewPages);
  const previewStart = (safePreviewPage - 1) * IMPORT_PREVIEW_PAGE_SIZE;
  const visibleEditableRows = previewRows.slice(
    previewStart,
    previewStart + IMPORT_PREVIEW_PAGE_SIZE
  );
  const canImport =
    selectedValidRows.length > 0 &&
    Boolean(responsibleUserId) &&
    mappingIssues.missingFields.length === 0 &&
    mappingIssues.duplicateFields.length === 0 &&
    !isOverflow &&
    !isCheckingIdentities &&
    !identityMatches.isError &&
    !history.isError &&
    !busy;

  useEffect(() => {
    if (previewPage > totalPreviewPages) setPreviewPage(totalPreviewPages);
  }, [previewPage, totalPreviewPages]);

  const importProgressLabel = importProgress
    ? importProgress.phase === "applicants"
      ? `Préparation ${importProgress.completed}/${importProgress.total}`
      : `Importation ${importProgress.completed}/${importProgress.total}`
    : null;

  closeRef.current = () => {
    if (activeRowId) setActiveRowId(null);
    else closeModal();
  };
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? [])
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey, true);
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    replaceClipboard(text);
  }

  function replaceClipboard(text: string) {
    if (busy) return;
    const nextTable = parsePastedContractTable(text);
    const nextMapping = loadImportMapping(workspaceId, currentUserId, nextTable.headers) ?? inferImportMapping(nextTable.headers);
    const rows = buildImportEditableRows(nextTable, nextMapping).slice(0, MAX_IMPORT_ROWS);
    setBatchId(createId());
    setClipboardText(text);
    setMapping(nextMapping);
    setEditableRows(rows);
    setSelectedRowIds(rows.map(row => row.id));
    setImportFiscalYear(fiscalYear);
    setActiveRowId(null);
    setViewFilter("all");
    const issues = validateImportMapping(nextMapping);
    setSourceOpen(!rows.length || issues.missingFields.length > 0 || issues.duplicateFields.length > 0);
    setImportError(null);
    setPreviewPage(1);
  }

  function handleMappingChange(index: number, field: ContractImportFieldId) {
    const next = [...mapping];
    next[index] = field;
    const mappedRows = buildImportEditableRows(table, next).slice(0, MAX_IMPORT_ROWS);
    const changedFields = [mapping[index], field].filter((item): item is ContractImportEditableField => Boolean(item) && item !== "ignore");
    setMapping(next);
    const issues = validateImportMapping(next);
    if (!issues.missingFields.length && !issues.duplicateFields.length) {
      try { saveImportMapping(workspaceId, currentUserId, table.headers, next); }
      catch { setImportError("Impossible de mémoriser les colonnes."); }
    }
    setEditableRows(previous => previous.map((row, rowIndex) => {
      if (row.importedContractId || hasAttempt(row)) return row;
      const updated = { ...row, importError: undefined };
      if (changedFields.includes("nif")) updated.duplicateResolution = undefined;
      for (const changed of changedFields) updated[changed] = mappedRows[rowIndex]?.[changed] ?? "";
      return updated;
    }));
    setPreviewPage(1);
  }

  function updateEditableRow(rowId: string, field: ContractImportEditableField, value: string, clear = false) {
    setEditableRows((prev) => prev.map((row) => row.id === rowId && !row.importedContractId && !hasAttempt(row) ? {
      ...row, [field]: value, importError: undefined,
      duplicateResolution: field === "nif" ? undefined : row.duplicateResolution,
      clearedFields: clear ? [...new Set([...(row.clearedFields ?? []), field])] : row.clearedFields?.filter(item => item !== field)
    } : row));
  }

  const selectedDuplicates = selectedPendingRows.filter(row => !row.excluded && !hasAttempt(row) && findImportDuplicate(row, history.data ?? [], targetFiscalYear));
  function resolveSelectedDuplicates(action: "keep" | "replace") {
    const ids = new Set(selectedDuplicates.map(row => row.id));
    setEditableRows(rows => rows.map(row => {
      const duplicate = ids.has(row.id) ? findImportDuplicate(row, history.data ?? [], targetFiscalYear) : undefined;
      return duplicate ? { ...row, importError: undefined, duplicateResolution: { contractId: duplicate.id, action } } : row;
    }));
  }

  async function handleUndo() {
    if (busy || !undoBatchId) return;
    setImportError(null);
    try {
      const result = await undoImport.mutateAsync({ workspaceId, userId: currentUserId, batchId: undoBatchId });
      const ids = new Set(result.undoneRowIds);
      const rows = draftRef.current.editableRows.map(row => row.contractId && ids.has(row.contractId)
        ? { ...row, contractId: createId(), importedContractId: undefined, importError: undefined, duplicateResolution: undefined } : row);
      setEditableRows(rows);
      persistDraft({ ...draftRef.current, editableRows: rows });
      setBatches(loadImportBatches(workspaceId, currentUserId));
      setImportError(result.errors.join("\n") || null);
      if (result.undoneRowIds.length) { onImported(0); setViewFilter("remaining"); }
    } catch (error) { setImportError(error instanceof Error ? error.message : "Annulation impossible."); }
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  }

  function toggleAllRowsSelection() {
    const filteredIds = new Set(selectablePreviewRows.map(row => row.id));
    setSelectedRowIds(previous => allRowsSelected
      ? previous.filter(id => !filteredIds.has(id))
      : [...new Set([...previous, ...filteredIds])]);
  }

  function applyBulkValue(scope: "selected" | "all") {
    const targetIds = scope === "selected" ? new Set(selectedRowIds) : null;
    setEditableRows((prev) =>
      prev.map((row) => {
        if (row.importedContractId || hasAttempt(row) || (targetIds && !targetIds.has(row.id))) return row;
        return { ...row, [bulkField]: bulkValue, importError: undefined, clearedFields: row.clearedFields?.filter(field => field !== bulkField) };
      })
    );
  }

  function setSelectedRowsExcluded(excluded: boolean) {
    const targetIds = new Set(selectedRowIds);
    if (excluded) {
      setSelectedRowIds(
        editableRows
          .filter((row) => !row.excluded && !targetIds.has(row.id))
          .map((row) => row.id)
      );
    }
    setEditableRows((prev) =>
      prev.map((row) => (targetIds.has(row.id) && !row.importedContractId ? { ...row, excluded } : row))
    );
  }

  function selectErrorRows() {
    setViewFilter("all");
    setSelectedRowIds(Array.from(errorRowIds));
    const firstProblemIndex = editableRows.findIndex((row) => errorRowIds.has(row.id));
    if (firstProblemIndex >= 0) {
      setPreviewPage(Math.floor(firstProblemIndex / IMPORT_PREVIEW_PAGE_SIZE) + 1);
    }
  }

  function closeModal() {
    if (busy) return;
    persistDraft();
    onClose();
  }

  async function handleImport() {
    setImportError(null);
    setImportProgress(null);
    if (isOverflow) {
      setImportError(`Cet import dépasse la limite de sécurité de ${MAX_IMPORT_ROWS} lignes. Divisez-le en plusieurs lots.`);
      return;
    }
    if (isCheckingIdentities) {
      setImportError("Attendez la fin de la vérification des NIF et NINU.");
      return;
    }
    if (identityMatches.isError || history.isError) {
      setImportError("Impossible de vérifier les doublons NIF/NINU dans la base. Réessayez.");
      return;
    }
    if (
      mappingIssues.missingFields.length > 0 ||
      mappingIssues.duplicateFields.length > 0
    ) {
      setImportError("Vérifiez les correspondances des colonnes.");
      return;
    }

    if (!canImport || !persistDraft()) return;
    setImportFiscalYear(targetFiscalYear);
    try {
      saveImportMapping(workspaceId, currentUserId, table.headers, mapping);
      const result = await importContracts.mutateAsync({
        workspaceId,
        batchId,
        userId: currentUserId,
        dossierId: selectedDossierId || null,
        onDossierCreated: (id) => {
          setSelectedDossierId(id);
          persistDraft({ ...draftRef.current, selectedDossierId: id });
        },
        onRowResult: ({ contractId, contract, error, skipped }) => {
          skipped ||= readSkippedContractIds(workspaceId).has(contractId);
          const rows = draftRef.current.editableRows.map(row => row.contractId === contractId
            ? { ...row, excluded: skipped || row.excluded, importedContractId: skipped ? undefined : contract?.id, importError: skipped ? undefined : error } : row);
          setEditableRows(rows);
          const saved = persistDraft({ ...draftRef.current, editableRows: rows });
          if (saved && contract) confirmImportReceipt(workspaceId, contractId);
        },
        responsibleUserId,
        fiscalYear: targetFiscalYear,
        rows: selectedValidRows.map((row) => ({ ...row.values!, sourceRowNumber: row.sourceRowNumber, position: genderedTitle(salaryGrid, row.values!.position, row.values!.gender) })),
        onProgress: setImportProgress
      });
      setBatches(loadImportBatches(workspaceId, currentUserId));
      setUndoBatchId(batchId);
      if (result.contracts.length) { onImported(result.contracts.length); setViewFilter("remaining"); }
      setImportProgress(null);
    } catch (error) {
      console.error(error);
      setImportProgress(null);
      setImportError(error instanceof Error ? error.message : "Impossible d'importer les contrats.");
    }
  }

  return createPortal(
    <div ref={dialogRef} className="contracts-import-modal import-workspace" role="dialog" aria-modal="true" aria-labelledby="contracts-import-title">
      <div className={`contracts-import-modal-card ${fiscalYearIsPast ? "fiscal-year-past-outline" : ""}`}>
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
            <div className={`contract-fiscal-year-badge ${fiscalYearIsPast ? "is-past" : ""}`}>
              <span className="material-symbols-rounded">calendar_month</span>
              Année fiscale {targetFiscalYear}
            </div>
          </div>
            <div className="contracts-import-meta-grid">
              <label className="form-label">
                Dossier
                <select
                  className="select"
                  disabled={busy}
                  aria-label="Dossier"
                  value={selectedDossierId}
                  onChange={(event) => setSelectedDossierId(event.target.value)}
                >
                  <DossierSelectOptions dossiers={dossiers} emptyLabel="Créer automatiquement" />
                </select>
              </label>
              <label className="form-label">
                Responsable
                <select
                  className="select"
                  disabled={busy}
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
          <button className="icon-btn" type="button" onClick={closeModal} title="Fermer" aria-label="Fermer" disabled={busy}>
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        {fiscalYearIsPast ? (
          <div className="fiscal-year-contract-warning" role="alert">
            <span className="material-symbols-rounded">warning</span>
            <div>
              <strong>Attention : année fiscale passée ({targetFiscalYear})</strong>
              <span>Tous les contrats de cet import seront enregistrés dans un exercice déjà terminé.</span>
            </div>
          </div>
        ) : null}

        <fieldset className="contracts-import-controls" disabled={busy}>
        <details className="import-source" open={sourceOpen}>
          <summary onClick={event => { event.preventDefault(); setSourceOpen(open => !open); }}>
            <span className="material-symbols-rounded" aria-hidden="true">content_paste</span>
            Source Excel <span>{table.rows.length ? `${table.rows.length} lignes · ${table.headers.length} colonnes` : ""}</span>
            <span className="material-symbols-rounded import-source-chevron" aria-hidden="true">{sourceOpen ? "expand_less" : "expand_more"}</span>
          </summary>
          <div className="import-source-content">
        <textarea
          ref={pasteRef}
          className="textarea contracts-import-paste"
          value={clipboardText}
          onPaste={handlePaste}
          onChange={(event) => replaceClipboard(event.target.value)}
          placeholder="Collez les lignes copiées depuis Excel"
        />
            {table.headers.length > 0 ? <div className="contracts-import-section-title">Correspondance des colonnes</div> : null}
            <div className="contracts-import-mapping">
              {table.headers.map((header, index) => (
                <div className="contracts-import-mapping-row" key={`${header}-${index}`}>
                  <div className="contracts-import-source">
                    <span>{header}</span>
                    <small>{table.rows[0]?.[index]?.trim() || "Vide"}</small>
                  </div>
                  <select
                    className="select"
                    disabled={editableRows.some(row => Boolean(row.importedContractId) || hasAttempt(row))}
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

          </div>
        </details>


        {table.headers.length > 0 ? (
          <>


            {identityMatches.isError || history.isError ? (
              <div className="form-error">
                Impossible de vérifier les doublons NIF/NINU dans la base. Corrigez la connexion puis réessayez.
              </div>
            ) : null}

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

            <div className="import-toolbar">
              <div className="import-filters" role="group" aria-label="Filtrer les lignes">
                {([
                  ["all", "Toutes", resolvedRows.length],
                  ["remaining", "Restantes", includedRows.length],
                  ["errors", "Erreurs", errorRowIds.size],
                  ["differences", "Différences", differenceRowIds.size],
                  ["imported", "Importées", completedIds.size]
                ] as const).map(([id, label, count]) => (
                  <button type="button" key={id} aria-pressed={viewFilter === id} onClick={() => { setViewFilter(id); setPreviewPage(1); }}>
                    {label} <span>{count}</span>
                  </button>
                ))}
              </div>
              <button className="btn btn-outline" type="button" onClick={selectErrorRows} disabled={!errorRowIds.size}>Sélectionner les erreurs</button>
            </div>
            {selectedPendingRows.length > 0 ? (
            <div className="contracts-import-bulkbar">
              <strong>{selectedPendingRows.length} sélectionnée(s)</strong>
              {selectedDuplicates.length > 0 ? <div className="import-bulk-duplicates">
                <button className="btn btn-outline" type="button" onClick={() => resolveSelectedDuplicates("keep")}>Garder les anciens ({selectedDuplicates.length})</button>
                <button className="btn btn-outline" type="button" onClick={() => resolveSelectedDuplicates("replace")}>Remplacer les anciens ({selectedDuplicates.length})</button>
              </div> : null}
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
            </div>
            ) : null}
            <div className="import-body">
            <div className="import-table-area">
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
                    <th>Nom</th>
                    <th>Prénom</th>
                    <th>NIF</th>
                    <th>NINU</th>
                    <th>Sexe</th>
                    <th>Adresse (optionnelle)</th>
                    <th>Téléphone (optionnel)</th>
                    <th>Salaire</th>
                    <th>Salaire lettres</th>
                    <th>Poste</th>
                    <th>Affectation</th>
                    <th>Durée</th>
                    <th>Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEditableRows.map((row) => {
                    const validation = validationById.get(row.id);
                    const duplicate = findImportDuplicate(row, history.data ?? [], targetFiscalYear);
                    const rowError = validation?.skipped ? undefined : row.importError;
                    const fieldErrors = new Set([...(validation?.errorFields ?? []), ...getImportErrorFields(rowError ? [rowError] : [])]);
                    const locked = row.excluded || Boolean(row.importedContractId) || hasAttempt(row);
                    const clearButton = (field: ContractImportEditableField) => (
                      <button className="contracts-import-clear" type="button" disabled={locked}
                        aria-label={`Effacer ${getImportFieldLabel(field)}, ligne ${row.sourceRowNumber}`}
                        title="Effacer" onClick={() => updateEditableRow(row.id, field, "", true)}>×</button>
                    );
                    const parsedSalary = parseImportMoney(row.salaryNumber);
                    const outsideGrid = salaryGridData !== undefined && parsedSalary !== null && salaryOutsideGrid(salaryGrid, row.position, parsedSalary);
                    const savedRequest = row.contractId ? readImportRequest(workspaceId, row.contractId) : null;
                    const imported = row.importedContractId ? history.data?.find(contract => contract.id === row.importedContractId) : null;
                    const mandateContract = imported ?? savedRequest;
                    const mandateWarning = !row.excluded && (!row.importedContractId || imported) ? contractMandateWarning(
                      mandateContract ?? { workspaceId, durationMonths: validation?.values?.durationMonths ?? NaN, annee_fiscale: targetFiscalYear },
                      mandateContract ? findContractMinister(mandateContract, ministerRegistry) : currentMinister
                    ) : null;
                    const stateClass = row.excluded || validation?.skipped
                      ? "excluded"
                      : validation?.errors.length || row.importError
                        ? "invalid"
                        : validation?.warnings.length || mandateWarning
                          ? "warning"
                          : "";
                    return (
                      <Fragment key={row.id}>
                        <tr className={`contracts-import-data-row ${stateClass} ${activeRowId === row.id ? "is-active" : ""}`}
                          onClick={event => { if (!(event.target as HTMLElement).closest("input, select, button")) setActiveRowId(row.id); }}>
                          <td>
                            <input
                              type="checkbox"
                              className="checkbox"
                              disabled={Boolean(row.importedContractId)}
                              checked={selectedRowIdSet.has(row.id)}
                              onChange={() => toggleRowSelection(row.id)}
                              aria-label={`Sélectionner la ligne ${row.sourceRowNumber}`}
                            />
                          </td>
                          <td>
                            <button type="button" className="import-row-open" aria-label={`Voir les différences de la ligne ${row.sourceRowNumber}`} aria-expanded={activeRowId === row.id} onClick={() => setActiveRowId(row.id)}>
                              {row.sourceRowNumber}
                              {differenceRowIds.has(row.id) ? <span className="import-difference-dot" /> : null}
                              {row.importedContractId ? <span aria-label="Importée">✓</span> : null}
                            </button>
                          </td>
                          <td>
                            <input
                              className="contracts-import-cell-input"
                              aria-label={`${getImportFieldLabel("lastName")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("lastName") || undefined}
                              value={row.lastName}
                              onChange={(event) => updateEditableRow(row.id, "lastName", event.target.value)}
                              disabled={locked}
                            />
                          </td>
                          <td>
                            <input
                              className="contracts-import-cell-input"
                              aria-label={`${getImportFieldLabel("firstName")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("firstName") || undefined}
                              value={row.firstName}
                              onChange={(event) => updateEditableRow(row.id, "firstName", event.target.value)}
                              disabled={locked}
                            />
                          </td>

                          <td>
                            <input
                              className="contracts-import-cell-input"
                              aria-label={`${getImportFieldLabel("nif")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("nif") || undefined}
                              value={row.nif}
                              onChange={(event) => updateEditableRow(row.id, "nif", event.target.value)}
                              disabled={locked}
                            />
                          </td>
                          <td className="contracts-import-optional-cell">
                            <input
                              className="contracts-import-cell-input"
                              aria-label={`${getImportFieldLabel("ninu")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("ninu") || undefined}
                              value={row.ninu}
                              onChange={(event) => updateEditableRow(row.id, "ninu", event.target.value)}
                              disabled={locked}
                            />
                            {clearButton("ninu")}
                          </td>
                          <td>
                            <select
                              className="contracts-import-cell-input"
                              aria-label={`${getImportFieldLabel("gender")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("gender") || undefined}
                              value={row.gender}
                              onChange={(event) => updateEditableRow(row.id, "gender", event.target.value)}
                              disabled={locked}
                            >
                              <option value={row.gender && row.gender !== "Homme" && row.gender !== "Femme" ? row.gender : ""}>
                                {row.gender && row.gender !== "Homme" && row.gender !== "Femme" ? row.gender : "Choisir"}
                              </option>
                              <option value="Homme">Homme</option>
                              <option value="Femme">Femme</option>
                            </select>
                          </td>
                          <td className="contracts-import-optional-cell">
                            <input
                              className="contracts-import-cell-input wide"
                              aria-label={`${getImportFieldLabel("address")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("address") || undefined}
                              value={row.address}
                              onChange={(event) => updateEditableRow(row.id, "address", event.target.value)}
                              disabled={locked}
                            />
                            {clearButton("address")}
                          </td>
                          <td className="contracts-import-optional-cell">
                            <input
                              className="contracts-import-cell-input"
                              aria-label={`${getImportFieldLabel("phone")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("phone") || undefined}
                              value={row.phone ?? ""}
                              onChange={(event) => updateEditableRow(row.id, "phone", event.target.value)}
                              disabled={locked}
                              inputMode="tel"
                            />
                            {clearButton("phone")}
                          </td>
                          <td>
                            <input
                              className="contracts-import-cell-input number"
                              aria-label={`${getImportFieldLabel("salaryNumber")}, ligne ${row.sourceRowNumber}`}
                              value={row.salaryNumber}
                              aria-invalid={outsideGrid || fieldErrors.has("salaryNumber") || undefined}
                              style={outsideGrid ? {color:"#dc2626", background:"rgba(220,38,38,.08)", borderColor:"#dc2626"} : undefined}
                              onChange={(event) => updateEditableRow(row.id, "salaryNumber", event.target.value)}
                              disabled={locked}
                            />
                          </td>
                          <td>
                            <input
                              className="contracts-import-cell-input wide"
                              aria-label={`Salaire en lettres, ligne ${row.sourceRowNumber}`}
                              value={row.salaryNumber ? numberToFrenchWords(parseImportMoney(row.salaryNumber) ?? NaN) : ""}
                              readOnly
                              disabled={locked}
                            />
                          </td>
                          <td>
                            <input
                              className="contracts-import-cell-input"
                              aria-label={`${getImportFieldLabel("position")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("position") || undefined}
                              value={row.position}
                              onChange={(event) => updateEditableRow(row.id, "position", event.target.value)}
                              disabled={locked}
                            />
                          </td>
                          <td>
                            <input
                              className="contracts-import-cell-input wide"
                              aria-label={`${getImportFieldLabel("assignment")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("assignment") || undefined}
                              value={row.assignment}
                              onChange={(event) => updateEditableRow(row.id, "assignment", event.target.value)}
                              disabled={locked}
                            />
                          </td>
                          <td>
                            <input
                              className="contracts-import-cell-input number"
                              aria-label={`${getImportFieldLabel("durationMonths")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("durationMonths") || undefined}
                              value={row.durationMonths}
                              onChange={(event) => updateEditableRow(row.id, "durationMonths", event.target.value)}
                              disabled={locked}
                            />
                          </td>
                          <td className="contracts-import-optional-cell">
                            <input
                              className="contracts-import-cell-input wide"
                              aria-label={`${getImportFieldLabel("commentaire")}, ligne ${row.sourceRowNumber}`}
                              aria-invalid={fieldErrors.has("commentaire") || undefined}
                              value={row.commentaire}
                              onChange={(event) => updateEditableRow(row.id, "commentaire", event.target.value)}
                              disabled={locked}
                            />
                            {clearButton("commentaire")}
                          </td>
                        </tr>
                        {duplicate && !row.importedContractId ? (
                          <tr><td colSpan={15} className="contracts-import-row-state">
                            <div className="import-duplicate-actions" role="group" aria-label={`Doublon, ligne ${row.sourceRowNumber}`}>
                              <strong>Ligne {row.sourceRowNumber} · Doublon</strong>
                              {(["keep", "replace"] as const).map(action => (
                                <button key={action} type="button" className="btn btn-outline"
                                  disabled={locked || busy}
                                  aria-pressed={row.duplicateResolution?.contractId === duplicate.id && row.duplicateResolution.action === action}
                                  onClick={() => setEditableRows(current => current.map(item => item.id === row.id
                                    ? { ...item, importError: undefined, duplicateResolution: { contractId: duplicate.id, action } } : item))}>
                                  {action === "keep" ? "Garder l’ancien" : "Remplacer par le nouveau"}
                                </button>
                              ))}
                            </div>
                          </td></tr>
                        ) : null}
                        {mandateWarning && <tr className="warning"><td colSpan={15}><div className="contract-mandate-warning" role="alert">Ligne {row.sourceRowNumber} · {mandateWarning}</div></td></tr>}
                        {Boolean(validation?.errors.length || rowError) && !row.importedContractId ? (
                          <tr className={stateClass}>
                            <td colSpan={15} className="contracts-import-row-state">
                              <span>Ligne {row.sourceRowNumber} · {rowError || validation?.errors.join(" ")}</span>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {!visibleEditableRows.length ? <tr><td colSpan={15} className="import-empty">Aucune ligne</td></tr> : null}
                </tbody>
              </table>
            </div>
            {previewRows.length > IMPORT_PREVIEW_PAGE_SIZE ? (
              <div className="contracts-import-preview-pagination">
                <span>
                  Lignes {previewStart + 1}–{Math.min(previewStart + IMPORT_PREVIEW_PAGE_SIZE, previewRows.length)} sur{" "}
                  {previewRows.length}
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
            </div>
            {activeRow ? (
              <aside className="import-differences-panel" aria-label={`Différences de la ligne ${activeRow.sourceRowNumber}`}>
                <div className="import-panel-head">
                  <div><strong>Différences <span>{activeDifferences.length}</span></strong><div>{activeRow.firstName} {activeRow.lastName} · Ligne {activeRow.sourceRowNumber}</div></div>
                  <button type="button" className="icon-btn" aria-label="Fermer les différences" onClick={() => {
                    setActiveRowId(null);
                    dialogRef.current?.querySelector<HTMLButtonElement>(`[aria-label="Voir les différences de la ligne ${activeRow.sourceRowNumber}"]`)?.focus();
                  }}><span className="material-symbols-rounded" aria-hidden="true">close</span></button>
                </div>
                <div className="import-panel-content">
                  {!activeDifferences.length ? <div className="import-empty">Aucune différence</div> : null}
                  {activeDifferences.map(({ field, oldValue, newValue }) => (
                    <div className="import-difference-card" key={field}>
                      <strong>{getImportFieldLabel(field)}</strong>
                      <div className="import-value-pair">
                        <div><small>Ancienne</small><p>{oldValue || "Vide"}</p></div>
                        <div><small>Nouvelle</small><p>{newValue || "Vide"}</p></div>
                      </div>
                      <button className="btn btn-outline" type="button"
                        disabled={busy || activeRow.excluded || Boolean(activeRow.importedContractId) || hasAttempt(activeRow)}
                        onClick={() => updateEditableRow(activeRow.id, field, oldValue, oldValue === "")}
                        aria-label={`Reprendre l’ancienne valeur : ${getImportFieldLabel(field)}, ligne ${activeRow.sourceRowNumber}`}>
                        Reprendre l’ancienne
                      </button>
                    </div>
                  ))}
                </div>
              </aside>
            ) : null}
            </div>
          </>
        ) : null}

        {importError ? <div className="form-error">{importError}</div> : null}

        {batches.some(batch => batch.entries.some(entry => entry.after && !entry.undone)) ? <div className="import-batch-actions">
          <select className="select" aria-label="Lot à annuler" value={undoBatchId} onChange={event => setUndoBatchId(event.target.value)} disabled={busy}>
            <option value="">Choisir un lot</option>
            {batches.filter(batch => batch.entries.some(entry => entry.after && !entry.undone)).map(batch => <option key={batch.id} value={batch.id}>
              {new Date(batch.createdAt).toLocaleString("fr-FR")} · {batch.entries.filter(entry => entry.after && !entry.undone).length} contrat(s)
            </option>)}
          </select>
          <button className="btn btn-outline" type="button" disabled={busy || !batches.find(batch => batch.id === undoBatchId)?.entries.some(entry => entry.after && !entry.undone)} onClick={() => void handleUndo()}>
            {undoImport.isPending ? "Annulation…" : "Annuler le lot"}
          </button>
        </div> : null}

        <div className="contracts-import-actions">
          <div className="import-summary" aria-live="polite">
            <span>{completedIds.size} importée(s)</span>
            <span>{editableRows.filter(row => !row.importedContractId && (row.excluded || !selectedRowIdSet.has(row.id))).length} ignorée(s)</span>
            <span>{errorRowCount} à corriger</span>
            {isCheckingIdentities ? <span>Vérification…</span> : null}
          </div>
          <button className="btn btn-outline" type="button" onClick={closeModal} disabled={busy}>
            Fermer
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void handleImport()} disabled={!canImport}>
            {importContracts.isPending ? importProgressLabel ?? "Importation..." : `Importer ${selectedValidRows.length} contrat(s)`}
          </button>
        </div>
        </fieldset>
      </div>
    </div>, document.body
  );
}
