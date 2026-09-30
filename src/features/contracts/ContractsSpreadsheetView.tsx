import { DiscardContractSyncButton } from "./DiscardContractSyncButton";
import { usePendingSync } from "../../lib/usePendingSync";
import { contractSyncInfo } from "../../data/local/outboxDependencies";
import { useSalaryGrid } from "../salary-grid/salaryGridApi";
import { approvedSalaries, genderedTitle, gridPositions, salaryOutsideGrid } from "../salary-grid/salaryGrid";
import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import "./contractsSpreadsheet.css";
import { AutocompleteField, type AutocompleteItem } from "../../app/ui/AutocompleteField";
import { Contract, Gender } from "../../data/types";
import { parseMoney, formatFirstName, formatLastName } from "../../lib/format";
import {
  formatNifInput,
  formatNifInputElement,
  prepareNifDigitOverwrite
} from "../../lib/nifInput";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import {
  formatInstitutionLocation,
  getInstitutionAddressRankingBoost,
  getLastChoice,
  learnSuggestions,
  saveLastChoice
} from "../../data/local/suggestionsDb";
import {
  useAddresses,
  useInstitutions,
} from "../settings/suggestionsApi";
import {
  useApplicantUpsert,
  useCreateContract,
  useUpdateContractComment,
  useUpdateContract,
  useDeleteContract,
  lookupNif
} from "./contractsApi";
import {
  clearUnsavedDraft,
  loadDraftValue,
  saveUnsavedDraft,
  spreadsheetDraftKey
} from "./contractUnsavedDrafts";
import { getStoredFiscalYear } from "../settings/settingsApi";
import { ContractCommentModal } from "./ContractCommentModal";
import { TagBadge } from "./TagBadge";
import { useDossiersList } from "../dossiers/dossiersApi";
import { DossierSelectOptions } from "../dossiers/DossierSelectOptions";
import {
  buildPositionSalaryItems,
  findFeaturedPositionSalaryItem,
} from "./positionSalarySuggestions";
import { areSpreadsheetDraftsEqual } from "./contractSpreadsheetDrafts";
import { getNextSpreadsheetCell } from "../../lib/spreadsheetNavigation";

import {
  SPREADSHEET_FIELDS, SpreadsheetHistory, normalizePastedValue,
  parseSpreadsheetClipboard, spreadsheetErrors,
  type SpreadsheetDraft, type SpreadsheetFieldKey, type SpreadsheetErrors,
  type SpreadsheetChange
} from "./spreadsheetEditing";

type SpreadsheetNewRow = {
  id: string;
  draft: SpreadsheetDraft;
};

type SpreadsheetPersistedDraft = {
  newRows: SpreadsheetNewRow[];
  draftById: Record<string, SpreadsheetDraft>;
  stagedRowKeys?: string[];
};

type SpreadsheetPreferences = {
  columnWidths: Partial<Record<SpreadsheetFieldKey, number>>;
  defaultsOpen: boolean;
  recentOpen: boolean;
  useDefaultDossier: boolean;
  defaultDossierId: string;
  useDefaultDuration: boolean;
  defaultDuration: number;
  useDefaultAddress: boolean;
  defaultAddress: string;
  useDefaultAssignment: boolean;
  defaultAssignment: string;
  useDefaultComment: boolean;
  defaultComment: string;
};

type SpreadsheetColumn = {
  key: SpreadsheetFieldKey;
  label: string;
  width: number;
  min: number;
};

const COLUMNS: SpreadsheetColumn[] = [
  { key: "nif", label: "NIF", width: 152, min: 152 },
  { key: "firstName", label: "Prénom", width: 148, min: 120 },
  { key: "lastName", label: "Nom", width: 148, min: 120 },
  { key: "gender", label: "Sexe", width: 108, min: 96 },
  { key: "ninu", label: "NINU", width: 158, min: 132 },
  { key: "address", label: "Adresse", width: 220, min: 164 },
  { key: "position", label: "Poste", width: 206, min: 156 },
  { key: "assignment", label: "Affectation", width: 214, min: 164 },
  { key: "salaryNumber", label: "Salaire (HTG)", width: 146, min: 132 },
  { key: "durationMonths", label: "Mois", width: 80, min: 60 }
];

const EMPTY_DRAFT: SpreadsheetDraft = {
  nif: "",
  firstName: "",
  lastName: "",
  gender: "",
  ninu: "",
  address: "",
  position: "",
  assignment: "",
  salaryNumber: "",
  salaryText: "",
  comment: "",
  durationMonths: "12"
};

const EMPTY_NEW_ROWS_COUNT = 3;
const NAVIGABLE_COLUMN_COUNT = 10;
const STATUS_COLUMN_WIDTH = 120;

function SpreadsheetRow({ children, rowKey, errors = {}, busy, ...props }: React.HTMLAttributes<HTMLDivElement> & {
  rowKey: string;
  errors?: SpreadsheetErrors;
  busy?: boolean;
}) {
  function decorate(child: React.ReactNode, index: number): React.ReactNode {
    if (!isValidElement<Record<string, unknown>>(child)) return child;
    const error = errors[COLUMNS[index].key];
    const description = error ? `sheet-error-${rowKey}-${index}` : undefined;
    if (child.type === "input" || child.type === "textarea") {
      return cloneElement(child, { "aria-label": COLUMNS[index].label, "aria-invalid": Boolean(error) || undefined, "aria-describedby": description, disabled: busy });
    }
    if (child.type === AutocompleteField) {
      return cloneElement(child, { ariaLabel: COLUMNS[index].label, ariaDescribedBy: description, hasError: Boolean(error) || child.props.hasError, disabled: busy });
    }
    if (child.props.children) return cloneElement(child, {}, Children.map(child.props.children as React.ReactNode, nested => decorate(nested, index)));
    return child;
  }
  return (
    <div {...props}>
      {Children.toArray(children).map((child, index) => {
        const error = errors[COLUMNS[index].key];
        return <div key={COLUMNS[index].key} className={`contracts-sheet-cell ${error ? "has-error" : ""}`}
          onClick={event => {
            if (!(event.target as HTMLElement).closest("input, textarea, button, [role=option]")) event.currentTarget.querySelector<HTMLElement>("[data-sheet-col]")?.focus();
          }}>
          {decorate(child, index)}
          {error && <span id={`sheet-error-${rowKey}-${index}`} className="sheet-cell-error">{error}</span>}
        </div>;
      })}
    </div>
  );
}

function DefaultDurationField({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <input aria-label="Durée par défaut (mois)" type="number" className="input defaults-input-mini" disabled={disabled}
    value={text} min={1} max={60} onChange={event => {
      setText(event.target.value);
      const number = event.target.valueAsNumber;
      if (Number.isInteger(number) && number >= 1 && number <= 60) onChange(number);
    }} onBlur={() => {
      const number = text.trim() ? Number(text) : value;
      const next = Number.isFinite(number) ? Math.min(60, Math.max(1, Math.round(number))) : value;
      setText(String(next));
      onChange(next);
    }} />;
}

function createEmptyDraft(): SpreadsheetDraft {
  return { ...EMPTY_DRAFT, durationMonths: getLastChoice("durationMonths") || "12" };
}

function createNewRow(): SpreadsheetNewRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    draft: createEmptyDraft()
  };
}

function createDefaultNewRows(): SpreadsheetNewRow[] {
  return Array.from({ length: EMPTY_NEW_ROWS_COUNT }, () => createNewRow());
}

function getNewRowKey(rowId: string): string {
  return `newRow_${rowId}`;
}

function getExistingRowKey(contractId: string): string {
  return `existingRow_${contractId}`;
}

type ContractsSpreadsheetViewProps = {
  workspaceId: string;
  userId: string;
  contracts: Contract[];
  isLoading: boolean;
  canDelete: boolean;
  showToolbar?: boolean;
  controls?: React.ReactNode;
  zoomMode?: SpreadsheetZoomMode;
  zoomPercent?: number;
};

export type SpreadsheetZoomMode = "fit" | "custom";

function formatNinuInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function computeSalaryText(salaryNumber: string): string {
  const numeric = parseMoney(salaryNumber || "0");
  return numeric ? numberToFrenchWords(numeric).toUpperCase() : "";
}

function toDraft(contract: Contract): SpreadsheetDraft {
  return {
    nif: contract.nif ?? "",
    firstName: contract.firstName ?? "",
    lastName: contract.lastName ?? "",
    gender: contract.gender ?? "Homme",
    ninu: contract.ninu ?? "",
    address: contract.address ?? "",
    position: contract.position ?? "",
    assignment: contract.assignment || "",
    salaryNumber: contract.salaryNumber?.toString() || "",
    salaryText: contract.salaryText || "",
    comment: contract.commentaire || "",
    durationMonths: contract.durationMonths?.toString() || "12"
  };
}

function isDraftEmpty(draft: SpreadsheetDraft): boolean {
  return (
    !draft.nif.trim() &&
    !draft.firstName.trim() &&
    !draft.lastName.trim() &&
    !draft.ninu.trim() &&
    !draft.position.trim() &&
    !draft.salaryNumber.trim()
  );
}

function normalizeDraft(draft: SpreadsheetDraft): SpreadsheetDraft {
  const salaryNumber = normalizePastedValue("salaryNumber", draft.salaryNumber);
  const salaryText = computeSalaryText(salaryNumber);
  return {
    nif: formatNifInput(draft.nif),
    firstName: formatFirstName(draft.firstName),
    lastName: formatLastName(draft.lastName),
    gender: draft.gender === "Femme" ? "Femme" : draft.gender === "Homme" ? "Homme" : "",
    ninu: formatNinuInput(draft.ninu),
    address: draft.address.trim(),
    position: draft.position.trim(),
    assignment: draft.assignment.trim(),
    salaryNumber,
    salaryText,
    comment: draft.comment.trim(),
    durationMonths: draft.durationMonths.trim() || "12"
  };
}

export function ContractsSpreadsheetView({
  workspaceId,
  userId,
  contracts,
  isLoading,
  canDelete,
  showToolbar = true,
  controls,
  zoomMode = "custom",
  zoomPercent = 100
}: ContractsSpreadsheetViewProps) {
  const pendingSync = usePendingSync();
  const cloudEnabled = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const updateContractComment = useUpdateContractComment();
  const upsertApplicant = useApplicantUpsert();
  const deleteContract = useDeleteContract();
  const { data: allAddresses = [] } = useAddresses(workspaceId);
  const { entries: salaryGrid, data: salaryGridData } = useSalaryGrid();
  const allPositions = useMemo(() => gridPositions(salaryGrid), [salaryGrid]);
  const { data: allInstitutions = [] } = useInstitutions(workspaceId);
  const isMedicalPosition = (pos: string) => /infirmi|medecin|médecin|pharmacien|sage-femme|laboratoire/i.test(pos || "");
  const unsavedDraftKey = useMemo(
    () => spreadsheetDraftKey(workspaceId, userId),
    [workspaceId, userId]
  );
  const draftHydratedRef = useRef(false);
  const preferencesKey = `${unsavedDraftKey}:preferences`;
  const preferences = useMemo(() => loadDraftValue<Partial<SpreadsheetPreferences>>(preferencesKey) ?? {}, [preferencesKey]);
  const [defaultsOpen, setDefaultsOpen] = useState(preferences.defaultsOpen ?? false);
  const [recentOpen, setRecentOpen] = useState(preferences.recentOpen ?? true);
  const [pasteError, setPasteError] = useState("");
  const [validatedRows, setValidatedRows] = useState<Set<string>>(new Set());
  const [stagedRowKeys, setStagedRowKeys] = useState<Set<string>>(() => new Set(loadDraftValue<SpreadsheetPersistedDraft>(unsavedDraftKey)?.stagedRowKeys ?? []));
  const stagedRowsRef = useRef(stagedRowKeys);
  const history = useRef(new SpreadsheetHistory());
  const [, refreshHistory] = useState(0);
  const editSession = useRef(0);
  const nifRequestVersions = useRef<Record<string, number>>({});
  const [savingBatch, setSavingBatch] = useState(false);


  const [msppModalOpen, setMsppModalOpen] = useState(false);
  const [msppHtml, setMsppHtml] = useState("");
  const [msppLoading, setMsppLoading] = useState(false);
  const [msppNif, setMsppNif] = useState("");

  const [draftById, setDraftById] = useState<Record<string, SpreadsheetDraft>>(() => {
    const saved = loadDraftValue<SpreadsheetPersistedDraft>(unsavedDraftKey);
    return saved?.draftById ?? {};
  });
  const [newRows, setNewRows] = useState<SpreadsheetNewRow[]>(() => {
    const saved = loadDraftValue<SpreadsheetPersistedDraft>(unsavedDraftKey);
    return saved?.newRows?.length ? saved.newRows : createDefaultNewRows();
  });
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [creatingRows, setCreatingRows] = useState<Record<string, boolean>>({});
  const creatingRowIdsRef = useRef<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [newRowErrors, setNewRowErrors] = useState<Record<string, string>>({});

  // ── Per-row NIF status for new rows ────────────────────────────────────────
  type NifRowStatus = {
    type: "blocked" | "renewal" | "ok";
    message: string;
  };
  const [nifCheckingRows, setNifCheckingRows] = useState<Record<string, boolean>>({});
  const [nifStatusByRow, setNifStatusByRow] = useState<Record<string, NifRowStatus>>({}); 

  const { data: dossiers = [] } = useDossiersList(workspaceId);

  const [useDefaultDossier, setUseDefaultDossier] = useState(preferences.useDefaultDossier ?? false);
  const [defaultDossierId, setDefaultDossierId] = useState<string>(preferences.defaultDossierId ?? "");

  const [useDefaultDuration, setUseDefaultDuration] = useState(preferences.useDefaultDuration ?? false);
  const [defaultDuration, setDefaultDuration] = useState<number>(() => {
    const last = getLastChoice("durationMonths");
    return preferences.defaultDuration ?? (last ? parseInt(last, 10) : 12);
  });

  const [useDefaultAddress, setUseDefaultAddress] = useState(preferences.useDefaultAddress ?? false);
  const [defaultAddress, setDefaultAddress] = useState<string>(() => preferences.defaultAddress ?? (getLastChoice("address") || ""));

  const [useDefaultAssignment, setUseDefaultAssignment] = useState(preferences.useDefaultAssignment ?? false);
  const [defaultAssignment, setDefaultAssignment] = useState<string>(() => preferences.defaultAssignment ?? (getLastChoice("assignment") || ""));

  const [useDefaultComment, setUseDefaultComment] = useState(preferences.useDefaultComment ?? false);
  const [defaultComment, setDefaultComment] = useState<string>(preferences.defaultComment ?? "");

  const [commentOpenContractId, setCommentOpenContractId] = useState<string | null>(null);
  const [commentDraftById, setCommentDraftById] = useState<Record<string, string>>({});
  const [columnWidths, setColumnWidths] = useState<Record<SpreadsheetFieldKey, number>>(
    () =>
      COLUMNS.reduce((acc, column) => {
        acc[column.key] = Math.max(column.min, Number(preferences.columnWidths?.[column.key]) || column.min);
        return acc;
      }, {} as Record<SpreadsheetFieldKey, number>)
  );
  useEffect(() => {
    saveUnsavedDraft(preferencesKey, {
      columnWidths, defaultsOpen, recentOpen, useDefaultDossier, defaultDossierId,
      useDefaultDuration, defaultDuration, useDefaultAddress, defaultAddress,
      useDefaultAssignment, defaultAssignment, useDefaultComment, defaultComment
    } satisfies SpreadsheetPreferences);
  }, [preferencesKey, columnWidths, defaultsOpen, recentOpen, useDefaultDossier, defaultDossierId, useDefaultDuration, defaultDuration, useDefaultAddress, defaultAddress, useDefaultAssignment, defaultAssignment, useDefaultComment, defaultComment]);

  const [resizing, setResizing] = useState<{
    key: SpreadsheetFieldKey;
    startX: number;
    startWidth: number;
    startZoom: number;
  } | null>(null);

  // ── MSPP Verification Fetch ──────────────────────────────────────────
  useEffect(() => {
    if (msppModalOpen && msppNif) {
      setMsppLoading(true);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mspp-verify-proxy-v2?nif=${msppNif.replace(/\D/g, "")}`;
      fetch(url)
        .then(res => res.text())
        .then(html => {
          setMsppHtml(html);
          setMsppLoading(false);
        })
        .catch(err => {
          setMsppHtml(`<p style="color:red;padding:20px">Erreur: ${err.message}</p>`);
          setMsppLoading(false);
        });
    }
  }, [msppModalOpen, msppNif]);

  const newRowsRef = useRef(newRows);
  const saveQueueRef = useRef<Record<string, Promise<void>>>({});
  const draftByIdRef = useRef(draftById);
  const contractsMapRef = useRef<Map<string, Contract>>(new Map());
  const sheetRootRef = useRef<HTMLDivElement | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const [sheetViewportWidth, setSheetViewportWidth] = useState(0);

  useEffect(() => {
    draftByIdRef.current = draftById;
  }, [draftById]);

  useEffect(() => {
    newRowsRef.current = newRows;
  }, [newRows]);

  const visibleContracts = useMemo(
    () =>
      [...contracts]
        .filter((contract) => contract.createdBy === userId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [contracts, userId]
  );

  const contractsMap = useMemo(
    () => new Map(visibleContracts.map((contract) => [contract.id, contract])),
    [visibleContracts]
  );

  useEffect(() => {
    contractsMapRef.current = contractsMap;
  }, [contractsMap]);

  useEffect(() => {
    draftHydratedRef.current = false;
    const saved = loadDraftValue<SpreadsheetPersistedDraft>(unsavedDraftKey);
    setDraftById(saved?.draftById ?? {});
    const staged = new Set(saved?.stagedRowKeys ?? []);
    stagedRowsRef.current = staged;
    setStagedRowKeys(staged);
    setValidatedRows(new Set(staged));
    history.current = new SpreadsheetHistory();
    setNifStatusByRow({});
    setNifCheckingRows({});
    nifRequestVersions.current = {};

    setNewRows(saved?.newRows?.length ? saved.newRows : createDefaultNewRows());
    const timeoutId = window.setTimeout(() => {
      draftHydratedRef.current = true;
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [unsavedDraftKey]);

  useEffect(() => {
    if (!draftHydratedRef.current || !workspaceId || !userId) return;

    const nonEmptyRows = newRows.filter((row) => !isDraftEmpty(normalizeDraft(row.draft)));
    const changedDraftById = Object.fromEntries(
      Object.entries(draftById).filter(([contractId, draft]) => {
        const contract = contractsMap.get(contractId);
        return !contract || !areSpreadsheetDraftsEqual(normalizeDraft(draft), normalizeDraft(toDraft(contract)));
      })
    ) as Record<string, SpreadsheetDraft>;

    if (nonEmptyRows.length === 0 && Object.keys(changedDraftById).length === 0) {
      clearUnsavedDraft(unsavedDraftKey);
      return;
    }

    saveUnsavedDraft<SpreadsheetPersistedDraft>(unsavedDraftKey, {
      newRows,
      draftById: changedDraftById,
      stagedRowKeys: [...stagedRowKeys]
    });
  }, [contractsMap, draftById, newRows, stagedRowKeys, unsavedDraftKey, userId, workspaceId]);

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (event: MouseEvent) => {
      const column = COLUMNS.find((item) => item.key === resizing.key);
      if (!column) return;
      const nextWidth = Math.max(column.min, resizing.startWidth + (event.clientX - resizing.startX) / resizing.startZoom);
      setColumnWidths((prev) => ({
        ...prev,
        [resizing.key]: nextWidth
      }));
    };

    const onMouseUp = () => {
      setResizing(null);
      document.body.classList.remove("sheet-is-resizing");
    };

    document.body.classList.add("sheet-is-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      document.body.classList.remove("sheet-is-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing]);

  useEffect(() => {
    const target = sheetScrollRef.current;
    if (!target) return;

    const updateWidth = () => setSheetViewportWidth(target.clientWidth);
    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(target);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isLoading]);

  const activeDefaults = {
    address: useDefaultAddress ? defaultAddress : "",
    assignment: useDefaultAssignment ? defaultAssignment : "",
    comment: useDefaultComment ? defaultComment : "",
    durationMonths: useDefaultDuration ? String(defaultDuration) : ""
  };
  const previousDefaults = useRef(activeDefaults);
  useEffect(() => {
    const previous = previousDefaults.current;
    const next = {
      address: useDefaultAddress ? defaultAddress : "",
      assignment: useDefaultAssignment ? defaultAssignment : "",
      comment: useDefaultComment ? defaultComment : "",
      durationMonths: useDefaultDuration ? String(defaultDuration) : ""
    };
    previousDefaults.current = next;
    setNewRows(rows => rows.map(row => {
      if (!isDraftEmpty(row.draft)) return row;
      const draft = { ...row.draft };
      for (const field of ["address", "assignment", "comment", "durationMonths"] as const) {
        const inherited = !draft[field] || draft[field] === previous[field] || (field === "durationMonths" && !previous[field] && Boolean(next[field]) && draft[field] === createEmptyDraft().durationMonths);
        if (inherited) draft[field] = next[field] || (field === "durationMonths" ? createEmptyDraft().durationMonths : "");
      }
      return { ...row, draft };
    }));
  }, [useDefaultAddress, defaultAddress, useDefaultAssignment, defaultAssignment, useDefaultComment, defaultComment, useDefaultDuration, defaultDuration]);

  const featuredAddress = useMemo(() => {
    const last = getLastChoice("address");
    return last ? { id: `last_address_${last}`, label: last } : undefined;
  }, []);

  const positionItems = useMemo(
    () => buildPositionSalaryItems(allPositions),
    [allPositions]
  );

  const femininePositionItems = useMemo(
    () => buildPositionSalaryItems(gridPositions(salaryGrid, "Femme")),
    [salaryGrid]
  );

  const featuredPosition = useMemo(() => {
    return findFeaturedPositionSalaryItem(
      positionItems,
      getLastChoice("position"),
      getLastChoice("positionSalary")
    );
  }, [positionItems]);

  const featuredAssignment = useMemo(() => {
    const last = getLastChoice("assignment");
    return last ? { id: `last_assignment_${last}`, label: last } : undefined;
  }, []);

  const addressItems: AutocompleteItem[] = useMemo(() => {
    return allAddresses.map((address) => ({ id: address.id, label: address.label }));
  }, [allAddresses]);

  function assignmentItemsForAddress(address: string): AutocompleteItem[] {
    return allInstitutions.map((institution) => ({
      id: institution.id,
      label: institution.label,
      sublabel: formatInstitutionLocation(institution),
      rankingBoost: getInstitutionAddressRankingBoost(institution, address)
    }));
  }

  const gridTemplateColumns = useMemo(
    () => COLUMNS.map((column) => `${columnWidths[column.key]}px`).join(" "),
    [columnWidths]
  );

  const totalWidth = useMemo(
    () => COLUMNS.reduce((total, column) => total + columnWidths[column.key], 0),
    [columnWidths]
  );
  const sheetGridWidth = totalWidth + STATUS_COLUMN_WIDTH;
  const effectiveZoom = useMemo(() => {
    if (zoomMode !== "fit") {
      return Math.max(0.5, Math.min(2, zoomPercent / 100));
    }
    if (!sheetViewportWidth) return 1;
    return Math.max(0.35, Math.min(1, sheetViewportWidth / sheetGridWidth));
  }, [sheetGridWidth, sheetViewportWidth, zoomMode, zoomPercent]);

  const rowOrder = useMemo(
    () => [
      ...newRows.map((row) => getNewRowKey(row.id)),
      ...(recentOpen ? visibleContracts.map((contract) => getExistingRowKey(contract.id)) : [])
    ],
    [newRows, visibleContracts, recentOpen]
  );

  const sheetBusy = savingBatch || Object.values(creatingRows).some(Boolean) || Object.values(savingRows).some(Boolean);
  const pendingCount = newRows.filter(row => !isDraftEmpty(row.draft)).length + [...stagedRowKeys].filter(key => key.startsWith("existingRow_")).length;

  function markStaged(keys: string[], staged = true) {
    const next = new Set(stagedRowsRef.current);
    keys.forEach(key => staged ? next.add(key) : next.delete(key));
    stagedRowsRef.current = next;
    setStagedRowKeys(next);
  }

  function recordChanges(changes: SpreadsheetChange[], rowKey: string, columnIndex: number, group?: string) {
    history.current.record({ changes, focus: { rowKey, columnIndex }, group });
    refreshHistory(value => value + 1);
  }

  function forgetHistory(rowKey: string) {
    history.current.forget(rowKey);
    markStaged([rowKey], false);
    refreshHistory(value => value + 1);
  }

  function applyChanges(changes: SpreadsheetChange[], reverse = false) {
    let rows = [...newRowsRef.current];
    const drafts = { ...draftByIdRef.current };
    for (const change of changes) {
      const value = reverse ? change.before : change.after;
      if (change.rowKey.startsWith("newRow_")) {
        const id = change.rowKey.slice("newRow_".length);
        nifRequestVersions.current[id] = (nifRequestVersions.current[id] ?? 0) + 1;
        const index = rows.findIndex(row => row.id === id);
        if (!value) rows = rows.filter(row => row.id !== id);
        else if (index < 0) rows.push({ id, draft: value });
        else rows[index] = { id, draft: value };
      } else {
        const id = change.rowKey.slice("existingRow_".length);
        if (value) drafts[id] = value;
        else delete drafts[id];
      }
    }
    newRowsRef.current = rows;
    draftByIdRef.current = drafts;
    setNewRows(rows);
    setDraftById(drafts);
    const touchedIds = new Set(changes.filter(change => change.rowKey.startsWith("newRow_")).map(change => change.rowKey.slice("newRow_".length)));
    setNifStatusByRow(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !touchedIds.has(id))));
    setNifCheckingRows(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !touchedIds.has(id))));
    setRowErrors(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !changes.some(change => change.rowKey === getExistingRowKey(id)))));
    setNewRowErrors(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !touchedIds.has(id))));
  }

  function restoreHistory(redo: boolean) {
    if (sheetBusy || creatingRowIdsRef.current.size) return;
    const edit = redo ? history.current.redo() : history.current.undo();
    if (!edit) return;
    editSession.current++;
    applyChanges(edit.changes, !redo);
    const keys = edit.changes.map(change => change.rowKey);
    markStaged(keys);
    setValidatedRows(previous => new Set([...previous, ...keys]));
    refreshHistory(value => value + 1);
    setPasteError("");
    if (edit.focus.rowKey.startsWith("existingRow_")) setRecentOpen(true);
    window.requestAnimationFrame(() => focusGridCell(edit.focus.rowKey, edit.focus.columnIndex));
  }

  function fieldErrors(rowKey: string, draft: SpreadsheetDraft): SpreadsheetErrors {
    if (rowKey.startsWith("newRow_") && isDraftEmpty(draft)) return {};
    const errors = validatedRows.has(rowKey) || stagedRowKeys.has(rowKey) ? spreadsheetErrors(draft) : {};
    if (rowKey.startsWith("newRow_")) {
      const id = rowKey.slice("newRow_".length);
      const status = nifStatusByRow[id];
      if (status?.type === "blocked") errors.nif = status.message;
      const nif = draft.nif.replace(/\D/g, "");
      if (nif.length === 10 && newRows.some(row => row.id !== id && row.draft.nif.replace(/\D/g, "") === nif)) {
        errors.nif = "Ce NIF est présent dans une autre ligne de saisie.";
      }
    }
    return errors;
  }

  function validateRow(rowKey: string, draft: SpreadsheetDraft, focus = true) {
    const errors = { ...spreadsheetErrors(draft), ...fieldErrors(rowKey, draft) };
    setValidatedRows(previous => new Set(previous).add(rowKey));
    const first = SPREADSHEET_FIELDS.findIndex(field => errors[field]);
    if (first < 0) return true;
    if (focus) {
      if (rowKey.startsWith("existingRow_")) setRecentOpen(true);
      window.requestAnimationFrame(() => focusGridCell(rowKey, first));
    }
    return false;
  }

  function handleSheetPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const rowKey = target.dataset.sheetRow;
    const columnIndex = Number(target.dataset.sheetCol);
    if (!rowKey || !Number.isInteger(columnIndex)) return;
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    if (sheetBusy) return;
    try {
      const matrix = parseSpreadsheetClipboard(text);
      if (!matrix.length) return;
      if (matrix.some(row => row.length + columnIndex > COLUMNS.length)) {
        throw new Error("Le collage dépasse la dernière colonne. Sélectionnez sa cellule de départ.");
      }
      const isNew = rowKey.startsWith("newRow_");
      const keys = isNew ? newRowsRef.current.map(row => getNewRowKey(row.id)) : visibleContracts.map(contract => getExistingRowKey(contract.id));
      const start = keys.indexOf(rowKey);
      if (start < 0) return;
      if (!isNew && start + matrix.length > keys.length) throw new Error("Le collage dépasse les contrats affichés. Collez les nouveaux contrats dans les lignes de saisie.");
      const changes = matrix.map((cells, offset): SpreadsheetChange => {
        const key = keys[start + offset] ?? getNewRowKey(createNewRow().id);
        const existing = isNew ? newRowsRef.current.find(row => getNewRowKey(row.id) === key)?.draft : draftByIdRef.current[key.slice("existingRow_".length)] ?? toDraft(contractsMap.get(key.slice("existingRow_".length))!);
        const after = { ...(existing ?? buildResetDraft()) };
        cells.forEach((value, index) => { after[COLUMNS[columnIndex + index].key] = normalizePastedValue(COLUMNS[columnIndex + index].key, value); });
        after.salaryText = computeSalaryText(after.salaryNumber);
        after.position = genderedTitle(salaryGrid, after.position, after.gender);
        return { rowKey: key, before: existing ?? null, after };
      });
      editSession.current++;
      recordChanges(changes, rowKey, columnIndex);
      applyChanges(changes);
      markStaged(changes.map(change => change.rowKey));
      setValidatedRows(previous => new Set([...previous, ...changes.map(change => change.rowKey)]));
      setPasteError("");
    } catch (error) { setPasteError(error instanceof Error ? error.message : "Collage impossible."); }
  }

  async function savePendingRows() {
    const rows = newRowsRef.current.filter(row => !isDraftEmpty(row.draft));
    const existingIds = [...stagedRowsRef.current].filter(key => key.startsWith("existingRow_")).map(key => key.slice("existingRow_".length));
    let firstInvalid: { rowKey: string; draft: SpreadsheetDraft } | undefined;
    for (const row of rows) {
      const rowKey = getNewRowKey(row.id);
      if (!validateRow(rowKey, row.draft, false)) firstInvalid ??= { rowKey, draft: row.draft };
    }
    for (const id of existingIds) {
      const draft = draftByIdRef.current[id];
      if (draft && !validateRow(getExistingRowKey(id), draft, false)) firstInvalid ??= { rowKey: getExistingRowKey(id), draft };
    }
    if (firstInvalid) { validateRow(firstInvalid.rowKey, firstInvalid.draft); return; }
    setSavingBatch(true);
    try {
      for (const row of rows) {
        if (!(await maybeCreateFromNewRow(row.id, {}, false))) return;
      }
      for (const id of existingIds) {
        if (!(await saveExistingRow(id))) return;
      }
      const next = newRowsRef.current.find(row => isDraftEmpty(row.draft));
      if (next) window.requestAnimationFrame(() => focusNewRowCell(next.id, 0));
    } finally { setSavingBatch(false); }
  }

  function isHorizontalBoundaryReached(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ): boolean {
    if (
      !(event.currentTarget instanceof HTMLInputElement) &&
      !(event.currentTarget instanceof HTMLTextAreaElement)
    ) {
      return true;
    }
    if (event.currentTarget.selectionStart === null || event.currentTarget.selectionEnd === null) {
      return true;
    }
    const { selectionStart, selectionEnd, value } = event.currentTarget;
    if (event.key === "ArrowLeft") {
      return selectionStart === 0 && selectionEnd === 0;
    }
    if (event.key === "ArrowRight") {
      return selectionStart === value.length && selectionEnd === value.length;
    }
    return true;
  }

  function focusGridCell(rowKey: string, columnIndex: number) {
    const selector = `[data-sheet-row="${rowKey}"][data-sheet-col="${columnIndex}"]`;
    const target = sheetRootRef.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.focus();
  }

  function focusNewRowCell(rowId: string, columnIndex: number) {
    focusGridCell(getNewRowKey(rowId), columnIndex);
  }

  const activeDefaultCount = [useDefaultDossier, useDefaultDuration, useDefaultAddress, useDefaultAssignment, useDefaultComment].filter(Boolean).length;
  function missingDefaultsChanges(): SpreadsheetChange[] {
    return newRowsRef.current.filter(row => !isDraftEmpty(row.draft)).flatMap(row => {
      const after = { ...row.draft };
      for (const field of ["address", "assignment", "comment", "durationMonths"] as const) {
        if (!after[field].trim() && activeDefaults[field]) after[field] = activeDefaults[field];
      }
      return JSON.stringify(after) === JSON.stringify(row.draft) ? [] : [{ rowKey: getNewRowKey(row.id), before: row.draft, after }];
    });
  }
  function completeDraftDefaults() {
    const changes = missingDefaultsChanges();
    if (!changes.length || sheetBusy) return;
    recordChanges(changes, changes[0].rowKey, 0);
    applyChanges(changes);
    markStaged(changes.map(change => change.rowKey));
  }
  function disableDefaults() {
    setUseDefaultDossier(false);
    setUseDefaultDuration(false);
    setUseDefaultAddress(false);
    setUseDefaultAssignment(false);
    setUseDefaultComment(false);
  }
  function chooseDefaultDossier(id: string) {
    setDefaultDossierId(id);
    const duration = dossiers.find(dossier => dossier.id === id)?.defaultDurationMonths;
    if (duration && duration >= 1 && duration <= 60) {
      setDefaultDuration(duration);
      setUseDefaultDuration(true);
    }
  }

  function buildResetDraft(durationValue?: string): SpreadsheetDraft {
    const nextDraft = createEmptyDraft();
    if (useDefaultAddress) nextDraft.address = defaultAddress;
    if (useDefaultAssignment) nextDraft.assignment = defaultAssignment;
    if (useDefaultComment) nextDraft.comment = defaultComment;
    if (useDefaultDuration) nextDraft.durationMonths = String(defaultDuration);
    else if (durationValue) nextDraft.durationMonths = durationValue;
    return nextDraft;
  }

  function clearNewRow(rowId: string) {
    const currentRow = newRowsRef.current.find((row) => row.id === rowId);
    const resetDraft = buildResetDraft(currentRow?.draft.durationMonths);
    if (currentRow) recordChanges([{ rowKey: getNewRowKey(rowId), before: currentRow.draft, after: resetDraft }], getNewRowKey(rowId), 0);
    nifRequestVersions.current[rowId] = (nifRequestVersions.current[rowId] ?? 0) + 1;
    markStaged([getNewRowKey(rowId)], false);
    setValidatedRows(previous => { const next = new Set(previous); next.delete(getNewRowKey(rowId)); return next; });
    setNewRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, draft: resetDraft } : row))
    );
    setNewRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setNifStatusByRow((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setNifCheckingRows((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    window.requestAnimationFrame(() => {
      focusNewRowCell(rowId, 0);
    });
  }

  function insertNewRowAfter(rowId: string) {
    const insertedRow = createNewRow();
    insertedRow.draft = buildResetDraft();
    recordChanges([{ rowKey: getNewRowKey(insertedRow.id), before: null, after: insertedRow.draft }], getNewRowKey(rowId), 0);
    setNewRows((prev) => {
      const index = prev.findIndex((row) => row.id === rowId);
      if (index < 0) return [...prev, insertedRow];
      return [...prev.slice(0, index + 1), insertedRow, ...prev.slice(index + 1)];
    });
    window.requestAnimationFrame(() => {
      focusNewRowCell(insertedRow.id, 0);
    });
  }

  function handleGridArrowNavigation(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    rowKey: string,
    columnIndex: number
  ) {
    if (event.defaultPrevented) return;

    if (event.key === "Enter") {
      event.preventDefault();
      if (rowKey.startsWith("newRow_") && columnIndex === NAVIGABLE_COLUMN_COUNT - 1) {
        void maybeCreateFromNewRow(rowKey.slice("newRow_".length));
        return;
      }
      const nextCell = getNextSpreadsheetCell(
        rowOrder,
        rowKey,
        columnIndex,
        NAVIGABLE_COLUMN_COUNT
      );
      if (nextCell) {
        window.requestAnimationFrame(() => {
          focusGridCell(nextCell.rowKey, nextCell.columnIndex);
        });
      }
      return;
    }

    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight"
    ) {
      return;
    }

    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !isHorizontalBoundaryReached(event)) {
      return;
    }

    const currentRowIndex = rowOrder.indexOf(rowKey);
    if (currentRowIndex < 0) return;

    let nextRowIndex = currentRowIndex;
    let nextColumnIndex = columnIndex;

    if (event.key === "ArrowUp") {
      nextRowIndex = Math.max(0, currentRowIndex - 1);
    } else if (event.key === "ArrowDown") {
      nextRowIndex = Math.min(rowOrder.length - 1, currentRowIndex + 1);
    } else if (event.key === "ArrowLeft") {
      nextColumnIndex = Math.max(0, columnIndex - 1);
    } else if (event.key === "ArrowRight") {
      nextColumnIndex = Math.min(NAVIGABLE_COLUMN_COUNT - 1, columnIndex + 1);
    }

    if (nextRowIndex === currentRowIndex && nextColumnIndex === columnIndex) return;

    event.preventDefault();
    window.requestAnimationFrame(() => {
      focusGridCell(rowOrder[nextRowIndex], nextColumnIndex);
    });
  }

  function checkAutoNext(rowId: string, colIndex: number, key: SpreadsheetFieldKey, value: string) {
    let complete = false;
    if (key === "nif") {
      const digits = value.replace(/\D/g, "");
      if (digits.length === 10) complete = true;
    } else if (key === "ninu") {
      const digits = value.replace(/\D/g, "");
      if (digits.length === 10) complete = true;
    } else if (key === "gender") {
      if (value === "Homme" || value === "Femme") complete = true;
    }

    if (complete) {
      window.requestAnimationFrame(() => {
        focusNewRowCell(rowId, colIndex + 1);
      });
    }
  }

  function getRowDraft(contract: Contract): SpreadsheetDraft {
    return draftById[contract.id] ?? toDraft(contract);
  }

  function editedDraft(source: SpreadsheetDraft, key: SpreadsheetFieldKey, value: string): SpreadsheetDraft {
    const next = { ...source };
    if (key === "nif") next.nif = formatNifInput(value);
    else if (key === "ninu") next.ninu = formatNinuInput(value);
    else if (key !== "salaryText") next[key] = value;
    if (key === "salaryNumber") next.salaryText = computeSalaryText(value);
    if (key === "gender" || key === "position") next.position = genderedTitle(salaryGrid, next.position, next.gender);
    return next;
  }

  function setExistingField(contractId: string, key: SpreadsheetFieldKey, value: string) {
    const contract = contractsMapRef.current.get(contractId);
    const source = draftByIdRef.current[contractId] ?? (contract ? toDraft(contract) : EMPTY_DRAFT);
    const next = editedDraft(source, key, value);
    const rowKey = getExistingRowKey(contractId);
    recordChanges([{ rowKey, before: source, after: next }], rowKey, SPREADSHEET_FIELDS.indexOf(key), `${rowKey}:${editSession.current}`);
    const drafts = { ...draftByIdRef.current, [contractId]: next };
    draftByIdRef.current = drafts;
    setDraftById(drafts);
    setRowErrors(previous => ({ ...previous, [contractId]: "" }));
  }

  function setNewField(rowId: string, key: SpreadsheetFieldKey, value: string) {
    const row = newRowsRef.current.find(item => item.id === rowId);
    if (!row) return;
    const next = editedDraft(row.draft, key, value);
    const rowKey = getNewRowKey(rowId);
    recordChanges([{ rowKey, before: row.draft, after: next }], rowKey, SPREADSHEET_FIELDS.indexOf(key), `${rowKey}:${editSession.current}`);
    const rows = newRowsRef.current.map(item => item.id === rowId ? { ...item, draft: next } : item);
    newRowsRef.current = rows;
    setNewRows(rows);
    if (key === "nif") {
      nifRequestVersions.current[rowId] = (nifRequestVersions.current[rowId] ?? 0) + 1;
      setNifStatusByRow(previous => { const next = { ...previous }; delete next[rowId]; return next; });
      setNifCheckingRows(previous => ({ ...previous, [rowId]: false }));
    }
    setNewRowErrors(previous => ({ ...previous, [rowId]: "" }));
  }

  function applyPositionSelection(contractId: string, item: AutocompleteItem) {
    const selectedItem = positionItems.find((candidate) => candidate.id === item.id);
    setExistingField(contractId, "position", item.label);
    if (selectedItem?.salaryNumber !== undefined) {
      setExistingField(contractId, "salaryNumber", String(selectedItem.salaryNumber));
    }
  }

  function applyNewPositionSelection(rowId: string, item: AutocompleteItem) {
    const selectedItem = positionItems.find((candidate) => candidate.id === item.id);
    setNewField(rowId, "position", item.label);
    if (selectedItem?.salaryNumber !== undefined) {
      setNewField(rowId, "salaryNumber", String(selectedItem.salaryNumber));
    }
  }

  function handleGenderShortcut(
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    setGender: (value: Gender | "") => void
  ) {
    const key = event.key.toLowerCase();
    if (key === "f") {
      event.preventDefault();
      setGender("Femme");
    }
    if (key === "h" || key === "m") {
      event.preventDefault();
      setGender("Homme");
    }
  }

  // ── NIF lookup for new rows ───────────────────────────────────────────
  async function handleNewRowNifComplete(rowId: string, nifFormatted: string) {
    if (!workspaceId) return;
    const beforeLookup = newRowsRef.current.find(row => row.id === rowId)?.draft;
    const version = (nifRequestVersions.current[rowId] ?? 0) + 1;
    nifRequestVersions.current[rowId] = version;
    const stillCurrent = () => nifRequestVersions.current[rowId] === version && newRowsRef.current.some(row => row.id === rowId && row.draft.nif === nifFormatted);
    setNifCheckingRows(previous => ({ ...previous, [rowId]: true }));
    try {
      const { identification, contracts: matches } = await lookupNif(nifFormatted, workspaceId);
      if (!stillCurrent()) return;
      const fiscalYear = getStoredFiscalYear();
      if (matches.some(contract => contract.annee_fiscale === fiscalYear)) {
        setNifStatusByRow(previous => ({ ...previous, [rowId]: { type: "blocked", message: `Un contrat existe déjà pour ${fiscalYear}.` } }));
        return;
      }
      const row = newRowsRef.current.find(item => item.id === rowId)!;
      const next = { ...row.draft };
      const fillIfUnchanged = (field: SpreadsheetFieldKey, value: string) => {
        if (row.draft[field] === beforeLookup?.[field]) next[field] = value;
      };
      if (identification) {
        fillIfUnchanged("firstName", identification.prenom);
        fillIfUnchanged("lastName", identification.nom);
        fillIfUnchanged("address", identification.adresse);
        if (identification.ninu) fillIfUnchanged("ninu", identification.ninu);
        if (["Homme", "Femme"].includes(identification.sexe ?? "")) fillIfUnchanged("gender", identification.sexe!);
      }
      const latest = matches[0];
      if (latest) {
        fillIfUnchanged("position", latest.titre);
        fillIfUnchanged("assignment", latest.lieu_affectation);
        if (latest.salaire_en_chiffre != null) fillIfUnchanged("salaryNumber", latest.salaire_en_chiffre.toString());
        next.salaryText = computeSalaryText(next.salaryNumber);
        setNifStatusByRow(previous => ({ ...previous, [rowId]: { type: "renewal", message: `Renouvellement — ${latest.annee_fiscale}` } }));
      }
      if (JSON.stringify(next) !== JSON.stringify(row.draft)) {
        recordChanges([{ rowKey: getNewRowKey(rowId), before: row.draft, after: next }], getNewRowKey(rowId), 0);
        const rows = newRowsRef.current.map(item => item.id === rowId ? { ...item, draft: next } : item);
        newRowsRef.current = rows;
        setNewRows(rows);
      }
    } catch {
      // A failed suggestion lookup leaves manual entry available; saving checks again.
    } finally {
      if (stillCurrent()) setNifCheckingRows(previous => ({ ...previous, [rowId]: false }));
    }
  }

  function queueExistingSave(contractId: string) {
    if (stagedRowsRef.current.has(getExistingRowKey(contractId))) return;
    const chain = saveQueueRef.current[contractId] ?? Promise.resolve();
    saveQueueRef.current[contractId] = chain
      .then(async () => {
        if (!stagedRowsRef.current.has(getExistingRowKey(contractId))) await saveExistingRow(contractId);
      })
      .catch(() => {
      });
  }

  async function saveExistingRow(contractId: string) {
    const contract = contractsMapRef.current.get(contractId);
    if (!contract || !workspaceId) return;

    const baseDraft = normalizeDraft(toDraft(contract));
    const editedDraft = normalizeDraft(draftByIdRef.current[contractId] ?? baseDraft);
    if (!validateRow(getExistingRowKey(contractId), draftByIdRef.current[contractId] ?? baseDraft, false)) return false;

    if (areSpreadsheetDraftsEqual(editedDraft, baseDraft)) {
      forgetHistory(getExistingRowKey(contractId));
      setRowErrors((prev) => {
        if (!prev[contractId]) return prev;
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
      return true;
    }

    setSavingRows((prev) => ({ ...prev, [contractId]: true }));

    try {
      const salaryNumberValue = parseMoney(editedDraft.salaryNumber);

      saveLastChoice("address", editedDraft.address);
      saveLastChoice("position", editedDraft.position);
      saveLastChoice("positionSalary", editedDraft.salaryNumber);
      saveLastChoice("assignment", editedDraft.assignment);
      await learnSuggestions(
        editedDraft.address,
        editedDraft.position,
        editedDraft.assignment,
        salaryNumberValue
      );

      const formattedFirstName = formatFirstName(editedDraft.firstName);
      const formattedLastName = formatLastName(editedDraft.lastName);

      const applicant = await upsertApplicant.mutateAsync({
        id: contract.applicantId ?? undefined,
        workspaceId,
        gender: editedDraft.gender as Gender,
        firstName: formattedFirstName,
        lastName: formattedLastName,
        nif: editedDraft.nif || null,
        ninu: editedDraft.ninu || null,
        address: editedDraft.address
      });

      await updateContract.mutateAsync({
        id: contract.id,
        workspaceId,
        applicantId: applicant.id,
        dossierId: contract.dossierId ?? null,
        status: contract.status,
        gender: editedDraft.gender as Gender,
        firstName: formattedFirstName,
        lastName: formattedLastName,
        nif: editedDraft.nif || null,
        ninu: editedDraft.ninu || null,
        address: editedDraft.address,
        position: genderedTitle(salaryGrid, editedDraft.position, editedDraft.gender),
        assignment: editedDraft.assignment,
        salaryNumber: salaryNumberValue,
        salaryText: editedDraft.salaryText,
        durationMonths: parseInt(editedDraft.durationMonths) || 12,
        commentaire: editedDraft.comment
      });

      saveLastChoice("durationMonths", editedDraft.durationMonths);

      setNewRows((prev) => prev.map((item) => {
        if (isDraftEmpty(normalizeDraft(item.draft))) {
           return {
             ...item,
             draft: {
               ...item.draft,
               durationMonths: useDefaultDuration ? String(defaultDuration) : editedDraft.durationMonths
             }
           };
        }
        return item;
      }));

      forgetHistory(getExistingRowKey(contractId));
      setDraftById((prev) => ({ ...prev, [contractId]: editedDraft }));
      setRowErrors((prev) => {
        if (!prev[contractId]) return prev;
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
      return true;
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({
        ...prev,
        [contractId]:
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer la ligne."
      }));
      return false;
    } finally {
      setSavingRows((prev) => {
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
    }
  }

  async function maybeCreateFromNewRow(
    rowId: string,
    draftOverride: Partial<SpreadsheetDraft> = {},
    focusNext = true
  ) {
    if (
      !workspaceId ||
      !userId ||
      creatingRowIdsRef.current.has(rowId) ||
      nifCheckingRows[rowId] ||
      nifStatusByRow[rowId]?.type === "blocked"
    ) return;

    const row = newRowsRef.current.find((item) => item.id === rowId);
    if (!row) return;
    const candidate = normalizeDraft({ ...row.draft, ...draftOverride });

    if (isDraftEmpty(candidate)) {
      setNewRowErrors((prev) => {
        if (!prev[rowId]) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      return;
    }

    if (!validateRow(getNewRowKey(rowId), { ...row.draft, ...draftOverride })) return false;

    creatingRowIdsRef.current.add(rowId);
    setCreatingRows((prev) => ({ ...prev, [rowId]: true }));
    setNewRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });

    try {
      const matches = await lookupNif(candidate.nif, workspaceId);
      if (matches.contracts.some(contract => contract.annee_fiscale === getStoredFiscalYear())) {
        setNifStatusByRow(previous => ({ ...previous, [rowId]: { type: "blocked", message: `Un contrat existe déjà pour ${getStoredFiscalYear()}.` } }));
        window.requestAnimationFrame(() => focusNewRowCell(rowId, 0));
        return false;
      }
      const salaryNumberValue = parseMoney(candidate.salaryNumber);

      saveLastChoice("address", candidate.address);
      saveLastChoice("position", candidate.position);
      saveLastChoice("positionSalary", candidate.salaryNumber);
      saveLastChoice("assignment", candidate.assignment);
      await learnSuggestions(
        candidate.address,
        candidate.position,
        candidate.assignment,
        salaryNumberValue
      );

      const formattedFirstName = formatFirstName(candidate.firstName);
      const formattedLastName = formatLastName(candidate.lastName);

      const applicant = await upsertApplicant.mutateAsync({
        workspaceId,
        createdBy: userId,
        gender: candidate.gender as Gender,
        firstName: formattedFirstName,
        lastName: formattedLastName,
        nif: candidate.nif || null,
        ninu: candidate.ninu || null,
        address: candidate.address
      });

      await createContract.mutateAsync({
        workspaceId,
        createdBy: userId,
        applicantId: applicant.id,
        dossierId: useDefaultDossier ? (defaultDossierId || null) : null,
        status: "saisie",
        gender: candidate.gender as Gender,
        firstName: formattedFirstName,
        lastName: formattedLastName,
        nif: candidate.nif || null,
        ninu: candidate.ninu || null,
        address: candidate.address,
        position: genderedTitle(salaryGrid, candidate.position, candidate.gender),
        assignment: candidate.assignment,
        salaryNumber: salaryNumberValue,
        salaryText: candidate.salaryText,
        durationMonths: parseInt(candidate.durationMonths) || 12,
        commentaire: candidate.comment
      });

      saveLastChoice("durationMonths", candidate.durationMonths);

      forgetHistory(getNewRowKey(rowId));
      const rows = newRowsRef.current.map(item => item.id === rowId ? { ...item, draft: buildResetDraft(candidate.durationMonths) } : item);
      const currentIndex = rows.findIndex(item => item.id === rowId);
      while (rows.filter(item => isDraftEmpty(item.draft)).length < EMPTY_NEW_ROWS_COUNT || !rows[currentIndex + 1]) {
        rows.push({ ...createNewRow(), draft: buildResetDraft(candidate.durationMonths) });
      }
      newRowsRef.current = rows;
      setNewRows(rows);
      setValidatedRows(previous => { const next = new Set(previous); next.delete(getNewRowKey(rowId)); return next; });
      setNifStatusByRow(previous => { const next = { ...previous }; delete next[rowId]; return next; });
      if (focusNext) window.requestAnimationFrame(() => focusNewRowCell(rows[currentIndex + 1].id, 0));
      return true;
    } catch (error) {
      console.error(error);
      setNewRowErrors((prev) => ({
        ...prev,
        [rowId]:
          error instanceof Error
            ? error.message
            : "Impossible de créer le contrat."
      }));
      return false;
    } finally {
      creatingRowIdsRef.current.delete(rowId);
      setCreatingRows((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
  }

  function openCommentDialog(contract: Contract) {
    setCommentOpenContractId(contract.id);
    setCommentDraftById((prev) => ({
      ...prev,
      [contract.id]: contract.commentaire ?? ""
    }));
  }

  async function saveComment(contractId: string) {
    const commentValue = (commentDraftById[contractId] ?? "").trim() || null;
    try {
      await updateContractComment.mutateAsync({
        id: contractId,
        workspaceId,
        commentaire: commentValue
      });
      setCommentOpenContractId(null);
    } catch (error) {
      console.error(error);
      window.alert("Impossible d'enregistrer le commentaire.");
    }
  }

  function renderNifInput(
    rowKey: string,
    columnIndex: number,
    value: string,
    onChange: (value: string) => void,
    onBlur: () => void,
    rowClassName: string,
    position?: string,
    ref?: React.RefObject<HTMLInputElement>
  ) {
    const isMedical = isMedicalPosition(position || "");
    const canVerify = isMedical && value.length >= 10;

    return (
      <div className="contracts-sheet-nif-field">
        <input
          ref={ref}
          data-sheet-row={rowKey}
          data-sheet-col={columnIndex}
          className={rowClassName}
          style={{ "--sheet-input-trailing-space": canVerify ? "32px" : "10px" } as React.CSSProperties}
          value={value}
          placeholder="000-000-000-0"
          onBeforeInput={(event) => prepareNifDigitOverwrite(event.currentTarget, (event.nativeEvent as InputEvent).data)}
          onChange={(event) => onChange(formatNifInputElement(event.currentTarget))}
          onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, columnIndex)}
          onBlur={onBlur}
        />
        {canVerify && (
          <div className="contracts-sheet-nif-indicator">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMsppNif(value);
                setMsppModalOpen(true);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px",
                color: "var(--accent, #10b981)",
                transition: "transform 0.2s ease"
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.2)"}
              onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
              title="Vérifier le permis MSPP"
            >
              <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>verified_user</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  type SyncState = "saved" | "saving" | "unsaved" | "error" | "empty" | "queued" | "local";

  function renderRowStatusIcon(
    syncState: SyncState,
    label: string,
    options?: {
      contract?: Contract;
      showCommentButton?: boolean;
      hasComment?: boolean;
      onCommentClick?: () => void;
      onAddClick?: () => void;
      addLabel?: string;
      onSaveClick?: () => void;
      saveLabel?: string;
      onDeleteClick?: () => void;
      deleteLabel?: string;
    }
  ) {
    const showCommentButton = Boolean(options?.showCommentButton);
    const hasComment = Boolean(options?.hasComment);

    let icon = "radio_button_unchecked";
    let colorClass = "empty";

    if (syncState === "saved") {
      icon = "check_circle";
      colorClass = "saved";
    } else if (syncState === "saving") {
      icon = "sync";
      colorClass = "pending";
    } else if (syncState === "queued" || syncState === "local") {
      icon = syncState === "queued" ? "cloud_upload" : "devices";
      colorClass = "pending";
    } else if (syncState === "unsaved") {
      icon = "edit";
      colorClass = "unsaved";
    } else if (syncState === "error") {
      icon = "error";
      colorClass = "error";
    }

    return (
      <div
        className={`contracts-sheet-state-cell ${colorClass}`}
        title={label}
        aria-label={label}
      >
        <span className={`material-symbols-rounded contracts-sheet-state-status-icon ${syncState === "saving" ? "is-spinning" : ""}`}>
          {icon}
        </span>
        {showCommentButton || options?.onAddClick || options?.onSaveClick || options?.onDeleteClick ? (
          <div className={`contracts-sheet-state-actions ${hasComment ? "has-visible-action" : ""}`}>
            {cloudEnabled && options?.contract && <DiscardContractSyncButton contract={options.contract} pending={pendingSync} online={navigator.onLine} iconOnly />}
            {options?.onAddClick ? (
              <button
                type="button"
                className="icon-btn contracts-sheet-add-row-btn"
                title={options.addLabel ?? "Ajouter une ligne en dessous"}
                aria-label={options.addLabel ?? "Ajouter une ligne en dessous"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  options.onAddClick?.();
                }}
              >
                <span className="material-symbols-rounded">add</span>
              </button>
            ) : null}
            {options?.onSaveClick ? (
              <button
                type="button"
                className="icon-btn contracts-sheet-save-row-btn"
                title={options.saveLabel ?? "Enregistrer cette ligne"}
                aria-label={options.saveLabel ?? "Enregistrer cette ligne"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  options.onSaveClick?.();
                }}
              >
                <span className="material-symbols-rounded">check</span>
              </button>
            ) : null}
            {showCommentButton ? (
              <button
                type="button"
                className={`icon-btn comment-trigger contracts-sheet-comment-btn ${hasComment ? "has-comment" : ""}`}
                title={hasComment ? "Voir ou modifier le commentaire" : "Ajouter un commentaire"}
                aria-label={hasComment ? "Voir ou modifier le commentaire" : "Ajouter un commentaire"}
                onClick={(event) => {
                  event.stopPropagation();
                  options?.onCommentClick?.();
                }}
              >
                <span className="material-symbols-rounded">chat_bubble</span>
              </button>
            ) : null}
            {options?.onDeleteClick ? (
              <button
                type="button"
                className="icon-btn contracts-sheet-delete-btn"
                title={options.deleteLabel ?? "Supprimer ce contrat"}
                aria-label={options.deleteLabel ?? "Supprimer ce contrat"}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  options.onDeleteClick?.();
                }}
              >
                <span className="material-symbols-rounded">delete</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (isLoading) {
    return <div className="empty-state">Chargement des contrats…</div>;
  }

  const activeCommentContract = commentOpenContractId
    ? visibleContracts.find((contract) => contract.id === commentOpenContractId) ?? null
    : null;

  return (
    <div
      className="contracts-sheet-wrapper contracts-data-sheet"
      ref={sheetRootRef}
      onPaste={handleSheetPaste}
      onFocusCapture={event => {
        if ((event.target as HTMLElement).dataset.sheetRow) editSession.current++;
      }}
      onKeyDownCapture={event => {
        if (!(event.target as HTMLElement).dataset.sheetRow || !(event.ctrlKey || event.metaKey) || event.altKey) return;
        if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") {
          event.preventDefault();
          event.stopPropagation();
          restoreHistory(event.shiftKey || event.key.toLowerCase() === "y");
        }
      }}
      style={{ "--sheet-state-width": `${STATUS_COLUMN_WIDTH}px` } as React.CSSProperties}
    >
      <div className="sheet-edit-toolbar" role="toolbar" aria-label="Actions du tableur">
        <div className="sheet-edit-actions">
          <button type="button" className="icon-btn" aria-label="Annuler la saisie" title="Annuler (Ctrl/⌘ Z)" disabled={!history.current.past.length || sheetBusy} onMouseDown={event => event.preventDefault()} onClick={() => restoreHistory(false)}>
            <span className="material-symbols-rounded" aria-hidden="true">undo</span>
          </button>
          <button type="button" className="icon-btn" aria-label="Rétablir la saisie" title="Rétablir (Ctrl/⌘ Maj Z)" disabled={!history.current.future.length || sheetBusy} onMouseDown={event => event.preventDefault()} onClick={() => restoreHistory(true)}>
            <span className="material-symbols-rounded" aria-hidden="true">redo</span>
          </button>
          <button type="button" className="btn btn-outline" onMouseDown={event => event.preventDefault()} onClick={() => insertNewRowAfter(newRowsRef.current[newRowsRef.current.length - 1].id)} disabled={sheetBusy}>
            <span className="material-symbols-rounded" aria-hidden="true">add</span>Ligne
          </button>
          {pendingCount > 0 && <button type="button" className="btn btn-primary" onMouseDown={event => event.preventDefault()} onClick={() => void savePendingRows()} disabled={sheetBusy || Object.values(nifCheckingRows).some(Boolean)}>
            <span className="material-symbols-rounded" aria-hidden="true">check</span>Enregistrer ({pendingCount})
          </button>}
          {showToolbar && <button type="button" className={`btn btn-outline ${defaultsOpen ? "active" : ""}`} aria-label="Valeurs par défaut" aria-expanded={defaultsOpen} aria-controls="sheet-defaults" onMouseDown={event => event.preventDefault()} onClick={() => setDefaultsOpen(open => !open)}>
            <span className="material-symbols-rounded" aria-hidden="true">tune</span>Valeurs par défaut{activeDefaultCount > 0 && <span className="sheet-default-count" aria-label={`${activeDefaultCount} actives`}>{activeDefaultCount}</span>}
          </button>}
        </div>
        <div className="sheet-edit-controls">{controls}</div>
      </div>
      {pasteError && <div className="contracts-sheet-inline-error" role="alert">{pasteError}</div>}
      {showToolbar && defaultsOpen ? (
        <div id="sheet-defaults" className="contracts-sheet-toolbar contracts-sheet-toolbar-defaults">
          <div className="sheet-default-fields">
            <div className={`sheet-default-field ${useDefaultDossier ? "is-active" : ""}`}>
              <label className="sheet-default-toggle">
                <span className="material-symbols-rounded" aria-hidden="true">folder</span><span>Dossier</span>
                <input type="checkbox" role="switch" aria-label="Activer dossier par défaut" checked={useDefaultDossier} disabled={sheetBusy} onChange={event => setUseDefaultDossier(event.target.checked)} />
              </label>
              <select aria-label="Dossier par défaut" className="select defaults-select" disabled={!useDefaultDossier || sheetBusy} value={defaultDossierId} onChange={event => chooseDefaultDossier(event.target.value)}><DossierSelectOptions dossiers={dossiers} /></select>
            </div>
            <div className={`sheet-default-field ${useDefaultDuration ? "is-active" : ""}`}>
              <label className="sheet-default-toggle">
                <span className="material-symbols-rounded" aria-hidden="true">calendar_month</span><span>Durée</span>
                <input type="checkbox" role="switch" aria-label="Activer durée par défaut" checked={useDefaultDuration} disabled={sheetBusy} onChange={event => setUseDefaultDuration(event.target.checked)} />
              </label>
              <DefaultDurationField value={defaultDuration} disabled={!useDefaultDuration || sheetBusy} onChange={setDefaultDuration} />
            </div>
            <div className={`sheet-default-field ${useDefaultAddress ? "is-active" : ""}`}>
              <label className="sheet-default-toggle">
                <span className="material-symbols-rounded" aria-hidden="true">location_on</span><span>Adresse</span>
                <input type="checkbox" role="switch" aria-label="Activer adresse par défaut" checked={useDefaultAddress} disabled={sheetBusy} onChange={event => setUseDefaultAddress(event.target.checked)} />
              </label>
              <AutocompleteField ariaLabel="Adresse par défaut" disabled={!useDefaultAddress || sheetBusy} className="input defaults-autocomplete" value={defaultAddress} onChange={setDefaultAddress} items={addressItems} placeholder="Adresse par défaut" pinCategory="address" />
            </div>
            <div className={`sheet-default-field ${useDefaultAssignment ? "is-active" : ""}`}>
              <label className="sheet-default-toggle">
                <span className="material-symbols-rounded" aria-hidden="true">business</span><span>Affectation</span>
                <input type="checkbox" role="switch" aria-label="Activer affectation par défaut" checked={useDefaultAssignment} disabled={sheetBusy} onChange={event => setUseDefaultAssignment(event.target.checked)} />
              </label>
              <AutocompleteField ariaLabel="Affectation par défaut" disabled={!useDefaultAssignment || sheetBusy} className="input defaults-autocomplete" value={defaultAssignment} onChange={setDefaultAssignment} items={assignmentItemsForAddress(defaultAddress)} placeholder="Affectation par défaut" pinCategory="assignment" />
            </div>
            <div className={`sheet-default-field ${useDefaultComment ? "is-active" : ""}`}>
              <label className="sheet-default-toggle">
                <span className="material-symbols-rounded" aria-hidden="true">chat_bubble</span><span>Commentaire</span>
                <input type="checkbox" role="switch" aria-label="Activer commentaire par défaut" checked={useDefaultComment} disabled={sheetBusy} onChange={event => setUseDefaultComment(event.target.checked)} />
              </label>
              <input aria-label="Commentaire par défaut" disabled={!useDefaultComment || sheetBusy} className="input defaults-input" value={defaultComment} onChange={event => setDefaultComment(event.target.value)} placeholder="Commentaire par défaut" />
            </div>
          </div>
          <div className="sheet-default-actions">
            <button type="button" className="btn btn-ghost" disabled={!activeDefaultCount || sheetBusy} onClick={disableDefaults}>Tout désactiver</button>
            <button type="button" className="btn btn-outline" disabled={sheetBusy || !missingDefaultsChanges().length} onClick={completeDraftDefaults}>Compléter les champs vides</button>
          </div>
        </div>
      ) : null}
      <div className="contracts-sheet-scroll" ref={sheetScrollRef}>
        <div
          className="contracts-sheet-grid"
          style={{
            width: `${sheetGridWidth}px`,
            zoom: effectiveZoom
          } as React.CSSProperties}
        >
          <div className="contracts-sheet-header-shell">
            <div className="contracts-sheet-state-head" title="État de synchronisation">
              <span className="material-symbols-rounded">sync</span>
            </div>
            <div className="contracts-sheet-header" style={{ gridTemplateColumns }}>
              {COLUMNS.map((column) => (
                <div key={column.key} className="contracts-sheet-head-cell">
                  <span>{column.label}</span>
                  <button
                    type="button"
                    className="contracts-sheet-resizer"
                    aria-label={`Redimensionner ${column.label}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setResizing({
                        key: column.key,
                        startX: event.clientX,
                        startWidth: columnWidths[column.key],
                        startZoom: effectiveZoom
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {newRows.map((row) => {
            const rowKey = getNewRowKey(row.id);
            const rowError = newRowErrors[row.id];
            const creating = Boolean(creatingRows[row.id]);
            const hasValues = !isDraftEmpty(normalizeDraft(row.draft));
            const nifChecking = Boolean(nifCheckingRows[row.id]);
            const nifStatus = nifStatusByRow[row.id] ?? null;
            const isBlocked = nifStatus?.type === "blocked";
            
            let syncState: SyncState = "empty";
            let label = "Vide";
            
            if (creating) {
               syncState = "saving";
               label = "Enregistrement en cours...";
            } else if (rowError || Object.keys(fieldErrors(rowKey, row.draft)).length) {
               syncState = "error";
               label = rowError || Object.values(fieldErrors(rowKey, row.draft))[0] || "Erreur de saisie";
            } else if (hasValues) {
               syncState = "unsaved";
               label = "Non synchronisé";
            }

            return (
              <div key={row.id} className="contracts-sheet-row-wrap">
                <div className={`contracts-sheet-row-shell ${creating ? "is-saving" : ""}`}>
                  {renderRowStatusIcon(syncState, label, {
                    onAddClick: !hasValues && !creating ? () => insertNewRowAfter(row.id) : undefined,
                    addLabel: "Ajouter une ligne en dessous",
                    onSaveClick: hasValues && !creating && !nifChecking && !isBlocked
                      ? () => { void maybeCreateFromNewRow(row.id); }
                      : undefined,
                    saveLabel: "Valider et enregistrer cette ligne",
                    onDeleteClick: hasValues && !creating ? () => clearNewRow(row.id) : undefined,
                    deleteLabel: "Effacer cette ligne"
                  })}
                  <SpreadsheetRow
                    rowKey={rowKey}
                    errors={fieldErrors(rowKey, row.draft)}
                    busy={creating}
                    className={`contracts-sheet-row contracts-sheet-row-new ${creating ? "is-saving" : ""}`}
                    style={{ gridTemplateColumns }}
                  >
                    {/* NIF cell with inline status indicator */}
                    <div className="contracts-sheet-nif-field">
                      <input
                        data-sheet-row={rowKey}
                        data-sheet-col={0}
                        className="input contracts-sheet-input"
                        style={{ "--sheet-input-trailing-space": (nifChecking || nifStatus) ? "32px" : "10px" } as React.CSSProperties}
                        value={row.draft.nif}
                        placeholder="000-000-000-0"
                        onBeforeInput={(event) => prepareNifDigitOverwrite(event.currentTarget, (event.nativeEvent as InputEvent).data)}
                        onChange={(event) => {
                          const wasComplete = row.draft.nif.replace(/\D/g, "").length === 10;
                          const formatted = formatNifInputElement(event.currentTarget);
                          setNewField(row.id, "nif", formatted);
                          if (!wasComplete) checkAutoNext(row.id, 0, "nif", formatted);
                          const digits = formatted.replace(/\D/g, "");
                          if (digits.length === 10) {
                            void handleNewRowNifComplete(row.id, formatted);
                          }
                        }}
                        onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 0)}
                      />
                      <div className="contracts-sheet-nif-indicator" style={{ pointerEvents: "none" }}>
                        {/* Loading spinner */}
                        {nifChecking && (
                          <span
                            className="material-symbols-rounded is-spinning"
                            style={{ fontSize: "15px", color: "var(--ink-muted)" }}
                          >sync</span>
                        )}
                        {/* Renewal badge */}
                        {!nifChecking && nifStatus?.type === "renewal" && (
                          <span
                            className="material-symbols-rounded"
                            title={nifStatus.message}
                            style={{ fontSize: "16px", color: "#ca8a04", cursor: "default" }}
                          >autorenew</span>
                        )}
                        {/* Blocked badge */}
                        {!nifChecking && nifStatus?.type === "blocked" && (
                          <span
                            className="material-symbols-rounded"
                            title={nifStatus.message}
                            style={{ fontSize: "16px", color: "#dc2626", cursor: "default" }}
                          >block</span>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={1}
                      data-sheet-row={rowKey}
                      data-sheet-col={1}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={row.draft.firstName}
                      placeholder="Prénom"
                      onChange={(event) => setNewField(row.id, "firstName", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 1)}
                    />
                    <textarea
                      rows={1}
                      data-sheet-row={rowKey}
                      data-sheet-col={2}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={row.draft.lastName}
                      placeholder="Nom"
                      onChange={(event) => setNewField(row.id, "lastName", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 2)}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={3}
                      className="input contracts-sheet-input"
                      value={row.draft.gender}
                      placeholder="H / F"
                      onChange={(event) => {
                        const val = event.target.value.toUpperCase();
                        let nextGender = val;
                        if (val === "H" || val === "HOMME") nextGender = "Homme";
                        else if (val === "F" || val === "FEMME") nextGender = "Femme";
                        
                        setNewField(row.id, "gender", nextGender as any);
                        checkAutoNext(row.id, 3, "gender", nextGender);
                      }}
                      onKeyDown={(event) => {
                        handleGenderShortcut(event, (value) => {
                          setNewField(row.id, "gender", value);
                          checkAutoNext(row.id, 3, "gender", value);
                        });
                        handleGridArrowNavigation(event, rowKey, 3);
                      }}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={4}
                      className="input contracts-sheet-input"
                      value={row.draft.ninu}
                      placeholder="0000000000"
                      onChange={(event) => {
                        setNewField(row.id, "ninu", event.target.value);
                        checkAutoNext(row.id, 4, "ninu", event.target.value);
                      }}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 4)}
                    />
                    <AutocompleteField
                      multiline
                      dataSheetRow={rowKey}
                      dataSheetCol={5}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={row.draft.address}
                      onChange={(value) => setNewField(row.id, "address", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 5)}
                      items={addressItems}
                      placeholder="Adresse"
                      featuredItem={featuredAddress}
                      pinCategory="address"
                    />
                    <AutocompleteField
                      multiline
                      dataSheetRow={rowKey}
                      dataSheetCol={6}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={row.draft.position}
                      onChange={(value) => setNewField(row.id, "position", value)}
                      onSelect={(item) => applyNewPositionSelection(row.id, item)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 6)}
                      items={row.draft.gender === "Femme" ? femininePositionItems : positionItems}
                      placeholder="Poste"
                      featuredItem={featuredPosition}
                      pinCategory="position"
                    />
                    <AutocompleteField
                      multiline
                      dataSheetRow={rowKey}
                      dataSheetCol={7}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={row.draft.assignment}
                      onChange={(value) => setNewField(row.id, "assignment", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 7)}
                      items={assignmentItemsForAddress(row.draft.address)}
                      placeholder="Affectation"
                      featuredItem={featuredAssignment}
                      pinCategory="assignment"
                    />
                    <AutocompleteField
                      dataSheetRow={rowKey}
                      dataSheetCol={8}
                      className="input contracts-sheet-input"
                      value={row.draft.salaryNumber}
                      hasError={salaryGridData !== undefined && salaryOutsideGrid(salaryGrid, row.draft.position, parseMoney(row.draft.salaryNumber))}
                      placeholder="Ex: 45000"
                      onChange={(value) => setNewField(row.id, "salaryNumber", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 8)}
                      items={approvedSalaries(salaryGrid, row.draft.position).map(s => ({ id: s.toString(), label: s.toString() }))}
                      showAllOnFocus={approvedSalaries(salaryGrid, row.draft.position).length > 1}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={9}
                      className="input contracts-sheet-input"
                      value={row.draft.durationMonths}
                      placeholder="12"
                      inputMode="numeric"
                      onChange={(event) => setNewField(row.id, "durationMonths", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 9)}
                      onBlur={(event) => {
                        if (stagedRowsRef.current.has(rowKey)) return;
                        void maybeCreateFromNewRow(row.id, {
                          durationMonths: event.currentTarget.value
                        });
                      }}
                    />
                  </SpreadsheetRow>
                </div>
                {rowError ? <div className="contracts-sheet-inline-error">{rowError}</div> : null}
                {nifStatus?.type === "renewal" && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "3px 8px", fontSize: "11px",
                    color: "#92400e", background: "rgba(234,179,8,0.08)",
                    borderLeft: "2px solid #ca8a04"
                  }}>
                    <span className="material-symbols-rounded" style={{ fontSize: "13px" }}>autorenew</span>
                    {nifStatus.message}
                  </div>
                )}

              </div>
            );
          })}

          <button type="button" className="contracts-sheet-divider sheet-recent-toggle" aria-expanded={recentOpen} aria-controls="sheet-recent-contracts" onClick={() => setRecentOpen(open => !open)}>
            <span className="material-symbols-rounded" aria-hidden="true">{recentOpen ? "expand_more" : "chevron_right"}</span>
            <strong>Contrats récents</strong><span>{visibleContracts.length}</span>
          </button>
          <div id="sheet-recent-contracts" hidden={!recentOpen}>
          {visibleContracts.map((contract) => {
            const rowKey = getExistingRowKey(contract.id);
            const draft = getRowDraft(contract);
            const rowError = rowErrors[contract.id];
            const saving = Boolean(savingRows[contract.id]);
            const hasChanges = !areSpreadsheetDraftsEqual(normalizeDraft(draft), normalizeDraft(toDraft(contract)));
            
            const info = contractSyncInfo(contract, pendingSync, cloudEnabled);
            let syncState: SyncState = info.error ? "error" : info.pending ? "queued" : cloudEnabled ? "saved" : "local";
            let label = info.error || info.label;
            
            if (saving) {
              syncState = "saving";
              label = "Enregistrement en cours...";
            } else if (rowError || Object.keys(fieldErrors(rowKey, draft)).length) {
              syncState = "error";
              label = rowError || Object.values(fieldErrors(rowKey, draft))[0] || "Erreur de saisie";
            } else if (hasChanges) {
              syncState = "unsaved";
              label = "Modifications non enregistrées";
            }

            return (
              <div key={contract.id} className="contracts-sheet-row-wrap">
                <div className={`contracts-sheet-row-shell ${saving ? "is-saving" : ""}`}>
                  {renderRowStatusIcon(
                    syncState,
                    label,
                    {
                      contract,
                      showCommentButton: true,
                      hasComment: Boolean(contract.commentaire?.trim()),
                      onCommentClick: () => openCommentDialog(contract),
                      onDeleteClick: canDelete
                        ? () => {
                            if (window.confirm("Supprimer ce contrat ?")) {
                              deleteContract.mutate({ id: contract.id, workspaceId });
                            }
                          }
                        : undefined
                    }
                  )}
                  <SpreadsheetRow
                    rowKey={rowKey}
                    errors={fieldErrors(rowKey, draft)}
                    busy={saving}
                    className={`contracts-sheet-row ${saving ? "is-saving" : ""}`}
                    style={{ gridTemplateColumns }}
                  >
                    {renderNifInput(
                      rowKey,
                      0,
                      draft.nif,
                      (value) => setExistingField(contract.id, "nif", value),
                      () => queueExistingSave(contract.id),
                      "input contracts-sheet-input",
                      draft.position
                    )}
                    <textarea
                      rows={1}
                      data-sheet-row={rowKey}
                      data-sheet-col={1}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={draft.firstName}
                      onChange={(event) =>
                        setExistingField(contract.id, "firstName", event.target.value)
                      }
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 1)}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                    <textarea
                      rows={1}
                      data-sheet-row={rowKey}
                      data-sheet-col={2}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={draft.lastName}
                      onChange={(event) =>
                        setExistingField(contract.id, "lastName", event.target.value)
                      }
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 2)}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={3}
                      className="input contracts-sheet-input"
                      value={draft.gender}
                      placeholder="H / F"
                      onChange={(event) => {
                        const val = event.target.value.toUpperCase();
                        if (val === "H" || val === "HOMME") setExistingField(contract.id, "gender", "Homme");
                        else if (val === "F" || val === "FEMME") setExistingField(contract.id, "gender", "Femme");
                        else setExistingField(contract.id, "gender", val);
                      }}
                      onKeyDown={(event) => {
                        handleGenderShortcut(event, (value) =>
                          setExistingField(contract.id, "gender", value)
                        );
                        handleGridArrowNavigation(event, rowKey, 3);
                      }}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={4}
                      className="input contracts-sheet-input"
                      value={draft.ninu}
                      onChange={(event) =>
                        setExistingField(contract.id, "ninu", event.target.value)
                      }
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 4)}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                    <AutocompleteField
                      multiline
                      dataSheetRow={rowKey}
                      dataSheetCol={5}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={draft.address}
                      onChange={(value) => setExistingField(contract.id, "address", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 5)}
                      onBlur={() => queueExistingSave(contract.id)}
                      items={addressItems}
                      featuredItem={featuredAddress}
                      pinCategory="address"
                    />
                    <AutocompleteField
                      multiline
                      dataSheetRow={rowKey}
                      dataSheetCol={6}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={draft.position}
                      onChange={(value) => setExistingField(contract.id, "position", value)}
                      onSelect={(item) => applyPositionSelection(contract.id, item)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 6)}
                      onBlur={() => queueExistingSave(contract.id)}
                      items={draft.gender === "Femme" ? femininePositionItems : positionItems}
                      featuredItem={featuredPosition}
                      pinCategory="position"
                    />
                    <AutocompleteField
                      multiline
                      dataSheetRow={rowKey}
                      dataSheetCol={7}
                      className="input contracts-sheet-input contracts-sheet-input-multiline"
                      value={draft.assignment}
                      onChange={(value) => setExistingField(contract.id, "assignment", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 7)}
                      onBlur={() => queueExistingSave(contract.id)}
                      items={assignmentItemsForAddress(draft.address)}
                      featuredItem={featuredAssignment}
                      pinCategory="assignment"
                    />
                    <AutocompleteField
                      dataSheetRow={rowKey}
                      dataSheetCol={8}
                      className="input contracts-sheet-input"
                      value={draft.salaryNumber}
                      hasError={salaryGridData !== undefined && salaryOutsideGrid(salaryGrid, draft.position, parseMoney(draft.salaryNumber))}
                      placeholder="Ex: 45000"
                      onChange={(value) =>
                        setExistingField(contract.id, "salaryNumber", value)
                      }
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 8)}
                      onBlur={() => queueExistingSave(contract.id)}
                      items={approvedSalaries(salaryGrid, draft.position).map(s => ({ id: s.toString(), label: s.toString() }))}
                      showAllOnFocus={approvedSalaries(salaryGrid, draft.position).length > 1}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={9}
                      className="input contracts-sheet-input"
                      value={draft.durationMonths}
                      placeholder="12"
                      inputMode="numeric"
                      onChange={(event) => setExistingField(contract.id, "durationMonths", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 9)}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                  </SpreadsheetRow>
                </div>
                {rowError ? <div className="contracts-sheet-inline-error">{rowError}</div> : null}
                {contract.tags && contract.tags.length > 0 && (
                  <div style={{ 
                    display: "flex", gap: "4px", flexWrap: "wrap",
                    padding: `4px 8px 4px ${STATUS_COLUMN_WIDTH + 10}px`,
                    borderBottom: "1px solid var(--border)", 
                    background: "var(--bg)",
                    borderRight: "1px solid var(--border)"
                  }}>
                    {contract.tags.map(tag => (
                      <TagBadge key={tag.id} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          </div>
        </div>
      </div>
      <ContractCommentModal
        isOpen={Boolean(activeCommentContract)}
        contractLabel={
          activeCommentContract
            ? `${activeCommentContract.firstName} ${activeCommentContract.lastName}`
            : ""
        }
        value={
          activeCommentContract
            ? commentDraftById[activeCommentContract.id] ?? activeCommentContract.commentaire ?? ""
            : ""
        }
        isSaving={updateContractComment.isPending}
        onChange={(value) => {
          if (!activeCommentContract) return;
          setCommentDraftById((prev) => ({ ...prev, [activeCommentContract.id]: value }));
        }}
        onClose={() => setCommentOpenContractId(null)}
        onSave={() => {
          if (!activeCommentContract) return;
          void saveComment(activeCommentContract.id);
        }}
      />
      {/* ── Modal MSPP ──────────────────────────────────── */}
      {msppModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMsppModalOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px"
          }}
        >
          <div style={{
            background: "var(--panel, #fff)",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "520px",
            maxHeight: "80vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border, #eee)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="material-symbols-rounded" style={{ fontSize: "20px", color: "var(--accent, #10b981)" }}>verified_user</span>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>Vérification MSPP</span>
              </div>
              <button
                type="button"
                onClick={() => setMsppModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", lineHeight: 1 }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: "20px", color: "var(--ink-muted, #666)" }}>close</span>
              </button>
            </div>
            <div style={{ flex: 1, position: "relative", minHeight: "320px", display: "flex", flexDirection: "column" }}>
              {msppLoading && (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 10,
                  background: "var(--panel, #fff)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "12px"
                }}>
                  <span className="material-symbols-rounded is-spinning" style={{ color: "var(--accent, #10b981)" }}>sync</span>
                  <span style={{ fontSize: "13px", color: "var(--ink-muted, #666)" }}>Chargement du MSPP...</span>
                </div>
              )}
              <iframe
                srcDoc={msppHtml}
                title="Vérification du permis MSPP"
                style={{ flex: 1, border: "none" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
