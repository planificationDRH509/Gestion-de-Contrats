import { useEffect, useMemo, useRef, useState } from "react";
import { AutocompleteField, type AutocompleteItem } from "../../app/ui/AutocompleteField";
import { Contract, Gender } from "../../data/types";
import { parseMoney, formatFirstName, formatLastName } from "../../lib/format";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import {
  getLastChoice,
  learnSuggestions,
  saveLastChoice
} from "../../data/local/suggestionsDb";
import {
  useAddresses,
  useInstitutions,
  usePositions
} from "../settings/suggestionsApi";
import {
  useApplicantUpsert,
  useCreateContract,
  useUpdateContractComment,
  useUpdateContract,
  useDeleteContract
} from "./contractsApi";
import { ContractCommentModal } from "./ContractCommentModal";
import { useDossiersList } from "../dossiers/dossiersApi";

type SpreadsheetFieldKey =
  | "nif"
  | "firstName"
  | "lastName"
  | "gender"
  | "ninu"
  | "address"
  | "position"
  | "assignment"
  | "salaryNumber"
  | "salaryText"
  | "comment"
  | "durationMonths";

type SpreadsheetDraft = {
  nif: string;
  firstName: string;
  lastName: string;
  gender: Gender | "";
  ninu: string;
  address: string;
  position: string;
  assignment: string;
  salaryNumber: string;
  salaryText: string;
  comment: string;
  durationMonths: string;
};

type SpreadsheetNewRow = {
  id: string;
  draft: SpreadsheetDraft;
};

type SpreadsheetColumn = {
  key: SpreadsheetFieldKey;
  label: string;
  width: number;
  min: number;
};

const COLUMNS: SpreadsheetColumn[] = [
  { key: "nif", label: "NIF", width: 152, min: 128 },
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
const STATUS_COLUMN_WIDTH = 64;

function createEmptyDraft(): SpreadsheetDraft {
  return { ...EMPTY_DRAFT };
}

function createNewRow(): SpreadsheetNewRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    draft: createEmptyDraft()
  };
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
  showToolbar?: boolean;
};

function formatNifInput(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(0, 10);
  let formatted = "";
  if (digits.length > 0) formatted += digits.slice(0, 3);
  if (digits.length > 3) formatted += `-${digits.slice(3, 6)}`;
  if (digits.length > 6) formatted += `-${digits.slice(6, 9)}`;
  if (digits.length > 9) formatted += `-${digits.slice(9, 10)}`;
  return formatted;
}

function formatNinuInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function computeSalaryText(salaryNumber: string): string {
  const numeric = parseMoney(salaryNumber || "0");
  return numeric ? numberToFrenchWords(numeric) : "";
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
  const salaryText = draft.salaryText.trim() || computeSalaryText(draft.salaryNumber);
  return {
    nif: formatNifInput(draft.nif),
    firstName: formatFirstName(draft.firstName),
    lastName: formatLastName(draft.lastName),
    gender: draft.gender === "Femme" ? "Femme" : draft.gender === "Homme" ? "Homme" : "",
    ninu: formatNinuInput(draft.ninu),
    address: draft.address.trim(),
    position: draft.position.trim(),
    assignment: draft.assignment.trim(),
    salaryNumber: draft.salaryNumber.trim(),
    salaryText,
    comment: draft.comment.trim(),
    durationMonths: draft.durationMonths.trim() || "12"
  };
}

function validateDraft(draft: SpreadsheetDraft): string | null {
  if (!/^\d{3}-\d{3}-\d{3}-\d$/.test(draft.nif)) {
    return "NIF invalide (format attendu: XXX-XXX-XXX-X).";
  }
  if (!draft.firstName) {
    return "Le prénom est obligatoire.";
  }
  if (!draft.lastName) {
    return "Le nom est obligatoire.";
  }
  if (draft.gender !== "Homme" && draft.gender !== "Femme") {
    return "Le sexe est obligatoire (Homme ou Femme).";
  }
  if (draft.ninu && !/^\d{10}$/.test(draft.ninu)) {
    return "NINU invalide (10 chiffres).";
  }
  if (!draft.address) {
    return "L'adresse est obligatoire.";
  }
  if (!draft.position) {
    return "Le poste est obligatoire.";
  }
  if (!draft.assignment) {
    return "L'affectation est obligatoire.";
  }
  const salaryValue = parseMoney(draft.salaryNumber);
  if (Number.isNaN(salaryValue) || salaryValue <= 0) {
    return "Le salaire doit être un nombre valide.";
  }
  return null;
}

function areDraftsEqual(a: SpreadsheetDraft, b: SpreadsheetDraft): boolean {
  return (
    a.nif === b.nif &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.gender === b.gender &&
    a.ninu === b.ninu &&
    a.address === b.address &&
    a.position === b.position &&
    a.assignment === b.assignment &&
    parseMoney(a.salaryNumber) === parseMoney(b.salaryNumber) &&
    a.salaryText === b.salaryText &&
    a.comment === b.comment
  );
}

export function ContractsSpreadsheetView({
  workspaceId,
  userId,
  contracts,
  isLoading,
  showToolbar = true
}: ContractsSpreadsheetViewProps) {
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const updateContractComment = useUpdateContractComment();
  const upsertApplicant = useApplicantUpsert();
  const deleteContract = useDeleteContract();
  const { data: allAddresses = [] } = useAddresses(workspaceId);
  const { data: allPositions = [] } = usePositions(workspaceId);
  const { data: allInstitutions = [] } = useInstitutions(workspaceId);

  const [draftById, setDraftById] = useState<Record<string, SpreadsheetDraft>>({});
  const [newRows, setNewRows] = useState<SpreadsheetNewRow[]>(() =>
    Array.from({ length: EMPTY_NEW_ROWS_COUNT }, () => createNewRow())
  );
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [creatingRows, setCreatingRows] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [newRowErrors, setNewRowErrors] = useState<Record<string, string>>({});

  const { data: dossiers = [] } = useDossiersList(workspaceId);

  const [useDefaultDossier, setUseDefaultDossier] = useState(false);
  const [defaultDossierId, setDefaultDossierId] = useState<string>("");
  
  const [useDefaultDuration, setUseDefaultDuration] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState<number>(() => {
    const last = getLastChoice("durationMonths");
    return last ? parseInt(last, 10) : 12;
  });

  const [useDefaultAddress, setUseDefaultAddress] = useState(false);
  const [defaultAddress, setDefaultAddress] = useState<string>(() => getLastChoice("address") || "");

  const [useDefaultAssignment, setUseDefaultAssignment] = useState(false);
  const [defaultAssignment, setDefaultAssignment] = useState<string>(() => getLastChoice("assignment") || "");

  const [useDefaultComment, setUseDefaultComment] = useState(false);
  const [defaultComment, setDefaultComment] = useState<string>("");

  const [commentOpenContractId, setCommentOpenContractId] = useState<string | null>(null);
  const [commentDraftById, setCommentDraftById] = useState<Record<string, string>>({});
  const [columnWidths, setColumnWidths] = useState<Record<SpreadsheetFieldKey, number>>(
    () =>
      COLUMNS.reduce((acc, column) => {
        acc[column.key] = column.width;
        return acc;
      }, {} as Record<SpreadsheetFieldKey, number>)
  );
  const [resizing, setResizing] = useState<{
    key: SpreadsheetFieldKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  const newRowsRef = useRef(newRows);
  const saveQueueRef = useRef<Record<string, Promise<void>>>({});
  const draftByIdRef = useRef(draftById);
  const contractsMapRef = useRef<Map<string, Contract>>(new Map());
  const sheetRootRef = useRef<HTMLDivElement | null>(null);

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
    if (!resizing) return;

    const onMouseMove = (event: MouseEvent) => {
      const column = COLUMNS.find((item) => item.key === resizing.key);
      if (!column) return;
      const nextWidth = Math.max(column.min, resizing.startWidth + (event.clientX - resizing.startX));
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
    setNewRows((prev) =>
      prev.map((row) => {
        const isCurrentlyEmpty = isDraftEmpty(normalizeDraft(row.draft));
        if (!isCurrentlyEmpty) return row;

        const nextDraft = { ...row.draft };
        let modified = false;

        if (useDefaultAddress && !row.draft.address) {
          nextDraft.address = defaultAddress;
          modified = true;
        }
        if (useDefaultAssignment && !row.draft.assignment) {
          nextDraft.assignment = defaultAssignment;
          modified = true;
        }
        if (useDefaultComment && !row.draft.comment) {
          nextDraft.comment = defaultComment;
          modified = true;
        }
        if (useDefaultDuration && row.draft.durationMonths === "12") {
          nextDraft.durationMonths = String(defaultDuration);
          modified = true;
        }

        return modified ? { ...row, draft: nextDraft } : row;
      })
    );
  }, [useDefaultAddress, defaultAddress, useDefaultAssignment, defaultAssignment, useDefaultComment, defaultComment, useDefaultDuration, defaultDuration]);

  const featuredAddress = useMemo(() => {
    const last = getLastChoice("address");
    return last ? { id: `last_address_${last}`, label: last } : undefined;
  }, []);

  const featuredPosition = useMemo(() => {
    const last = getLastChoice("position");
    const match = allPositions.find((position) => position.label === last);
    return last
      ? {
          id: `last_position_${last}`,
          label: last,
          sublabel:
            match && match.defaultSalary > 0
              ? `${match.defaultSalary.toLocaleString("fr-HT")} HTG`
              : undefined
        }
      : undefined;
  }, [allPositions]);

  const featuredAssignment = useMemo(() => {
    const last = getLastChoice("assignment");
    return last ? { id: `last_assignment_${last}`, label: last } : undefined;
  }, []);

  const addressItems: AutocompleteItem[] = useMemo(() => {
    return allAddresses.map((address) => ({ id: address.id, label: address.label }));
  }, [allAddresses]);

  const positionItems: AutocompleteItem[] = useMemo(() => {
    return allPositions.map((position) => ({
      id: position.id,
      label: position.label,
      sublabel:
        position.defaultSalary > 0
          ? `${position.defaultSalary.toLocaleString("fr-HT")} HTG`
          : undefined
    }));
  }, [allPositions]);

  const assignmentItems: AutocompleteItem[] = useMemo(() => {
    return allInstitutions.map((institution) => ({ id: institution.id, label: institution.label }));
  }, [allInstitutions]);

  const gridTemplateColumns = useMemo(
    () => COLUMNS.map((column) => `${columnWidths[column.key]}px`).join(" "),
    [columnWidths]
  );

  const totalWidth = useMemo(
    () => COLUMNS.reduce((total, column) => total + columnWidths[column.key], 0),
    [columnWidths]
  );

  const rowOrder = useMemo(
    () => [
      ...newRows.map((row) => getNewRowKey(row.id)),
      ...visibleContracts.map((contract) => getExistingRowKey(contract.id))
    ],
    [newRows, visibleContracts]
  );

  function isHorizontalBoundaryReached(
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ): boolean {
    if (!(event.currentTarget instanceof HTMLInputElement)) {
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

  function handleGridArrowNavigation(
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowKey: string,
    columnIndex: number
  ) {
    if (event.defaultPrevented) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
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

  function getRowDraft(contract: Contract): SpreadsheetDraft {
    return draftById[contract.id] ?? toDraft(contract);
  }

  function setExistingField(contractId: string, key: SpreadsheetFieldKey, value: string) {
    setDraftById((prev) => {
      const contract = contractsMapRef.current.get(contractId);
      const source = prev[contractId] ?? (contract ? toDraft(contract) : EMPTY_DRAFT);
      const next: SpreadsheetDraft = { ...source };

      if (key === "nif") next.nif = formatNifInput(value);
      else if (key === "ninu") next.ninu = formatNinuInput(value);
      else if (key === "gender") next.gender = value as Gender | "";
      else if (key === "salaryNumber") {
        next.salaryNumber = value;
        next.salaryText = computeSalaryText(value);
      } else if (key !== "salaryText") {
        (next[key] as string) = value;
      }

      return { ...prev, [contractId]: next };
    });

    setRowErrors((prev) => {
      if (!prev[contractId]) return prev;
      const next = { ...prev };
      delete next[contractId];
      return next;
    });
  }

  function setNewField(rowId: string, key: SpreadsheetFieldKey, value: string) {
    setNewRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const next: SpreadsheetDraft = { ...row.draft };
        if (key === "nif") next.nif = formatNifInput(value);
        else if (key === "ninu") next.ninu = formatNinuInput(value);
        else if (key === "gender") next.gender = value as Gender | "";
        else if (key === "salaryNumber") {
          next.salaryNumber = value;
          next.salaryText = computeSalaryText(value);
        } else if (key !== "salaryText") {
          (next[key] as string) = value;
        }
        return {
          ...row,
          draft: next
        };
      })
    );
    setNewRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }

  function applyPositionSelection(contractId: string, item: AutocompleteItem) {
    const match = allPositions.find((position) => position.id === item.id);
    setExistingField(contractId, "position", item.label);
    if (match && match.defaultSalary > 0) {
      setExistingField(contractId, "salaryNumber", String(match.defaultSalary));
    }
  }

  function applyNewPositionSelection(rowId: string, item: AutocompleteItem) {
    const match = allPositions.find((position) => position.id === item.id);
    setNewField(rowId, "position", item.label);
    if (match && match.defaultSalary > 0) {
      setNewField(rowId, "salaryNumber", String(match.defaultSalary));
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

  function queueExistingSave(contractId: string) {
    const chain = saveQueueRef.current[contractId] ?? Promise.resolve();
    saveQueueRef.current[contractId] = chain
      .then(async () => {
        await saveExistingRow(contractId);
      })
      .catch(() => {
      });
  }

  async function saveExistingRow(contractId: string) {
    const contract = contractsMapRef.current.get(contractId);
    if (!contract || !workspaceId) return;

    const baseDraft = normalizeDraft(toDraft(contract));
    const editedDraft = normalizeDraft(draftByIdRef.current[contractId] ?? baseDraft);
    const validationError = validateDraft(editedDraft);

    if (validationError) {
      setRowErrors((prev) => ({ ...prev, [contractId]: validationError }));
      return;
    }

    if (areDraftsEqual(editedDraft, baseDraft)) {
      setRowErrors((prev) => {
        if (!prev[contractId]) return prev;
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
      return;
    }

    setSavingRows((prev) => ({ ...prev, [contractId]: true }));

    try {
      const salaryNumberValue = parseMoney(editedDraft.salaryNumber);

      saveLastChoice("address", editedDraft.address);
      saveLastChoice("position", editedDraft.position);
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
        position: editedDraft.position,
        assignment: editedDraft.assignment,
        salaryNumber: salaryNumberValue,
        salaryText: editedDraft.salaryText,
        durationMonths: parseInt(editedDraft.durationMonths) || 12,
        commentaire: editedDraft.comment
      });

      saveLastChoice("durationMonths", editedDraft.durationMonths);

      setDraftById((prev) => ({ ...prev, [contractId]: editedDraft }));
      setRowErrors((prev) => {
        if (!prev[contractId]) return prev;
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({
        ...prev,
        [contractId]:
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer la ligne."
      }));
    } finally {
      setSavingRows((prev) => {
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
    }
  }

  async function maybeCreateFromNewRow(rowId: string) {
    if (!workspaceId || !userId || creatingRows[rowId]) return;

    const row = newRowsRef.current.find((item) => item.id === rowId);
    if (!row) return;
    const candidate = normalizeDraft(row.draft);

    if (isDraftEmpty(candidate)) {
      setNewRowErrors((prev) => {
        if (!prev[rowId]) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      return;
    }

    const validationError = validateDraft(candidate);
    if (validationError) {
      setNewRowErrors((prev) => ({ ...prev, [rowId]: validationError }));
      return;
    }

    setCreatingRows((prev) => ({ ...prev, [rowId]: true }));
    setNewRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });

    try {
      const salaryNumberValue = parseMoney(candidate.salaryNumber);

      saveLastChoice("address", candidate.address);
      saveLastChoice("position", candidate.position);
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
        position: candidate.position,
        assignment: candidate.assignment,
        salaryNumber: salaryNumberValue,
        salaryText: candidate.salaryText,
        durationMonths: parseInt(candidate.durationMonths) || 12,
        commentaire: candidate.comment
      });

      saveLastChoice("durationMonths", candidate.durationMonths);

      setNewRows((prev) => {
        const next = prev.map((item) => {
          if (item.id !== rowId) return item;
          const empty = createNewRow();
          if (useDefaultAddress) empty.draft.address = defaultAddress;
          if (useDefaultAssignment) empty.draft.assignment = defaultAssignment;
          if (useDefaultComment) empty.draft.comment = defaultComment;
          if (useDefaultDuration) empty.draft.durationMonths = String(defaultDuration);
          return empty;
        });
        const emptyRowsCount = next.filter((item) => isDraftEmpty(item.draft)).length;
        if (emptyRowsCount < EMPTY_NEW_ROWS_COUNT) {
          const toAdd = EMPTY_NEW_ROWS_COUNT - emptyRowsCount;
          const extra = Array.from({ length: toAdd }, () => {
            const row = createNewRow();
            if (useDefaultAddress) row.draft.address = defaultAddress;
            if (useDefaultAssignment) row.draft.assignment = defaultAssignment;
            if (useDefaultComment) row.draft.comment = defaultComment;
            if (useDefaultDuration) row.draft.durationMonths = String(defaultDuration);
            return row;
          });
          return [...next, ...extra];
        }
        return next;
      });
    } catch (error) {
      console.error(error);
      setNewRowErrors((prev) => ({
        ...prev,
        [rowId]:
          error instanceof Error
            ? error.message
            : "Impossible de créer le contrat."
      }));
    } finally {
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
    ref?: React.RefObject<HTMLInputElement>
  ) {
    return (
      <input
        ref={ref}
        data-sheet-row={rowKey}
        data-sheet-col={columnIndex}
        className={rowClassName}
        value={value}
        placeholder="000-000-000-0"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, columnIndex)}
        onBlur={onBlur}
      />
    );
  }

  type SyncState = "saved" | "saving" | "unsaved" | "error" | "empty";

  function renderRowStatusIcon(
    syncState: SyncState,
    label: string,
    options?: {
      showCommentButton?: boolean;
      hasComment?: boolean;
      onCommentClick?: () => void;
      onDeleteClick?: () => void;
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
            title="Supprimer ce contrat"
            aria-label="Supprimer ce contrat"
            onClick={(event) => {
              event.stopPropagation();
              options.onDeleteClick?.();
            }}
          >
            <span className="material-symbols-rounded">delete</span>
          </button>
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
    <div className="contracts-sheet-wrapper" ref={sheetRootRef}>
      {showToolbar ? (
        <div className="contracts-sheet-toolbar">
          <div className="contracts-sheet-defaults-bar">
            <div className="defaults-bar-item">
              <label className={`defaults-checkbox ${useDefaultDossier ? "is-active" : ""}`}>
                <input
                  type="checkbox"
                  checked={useDefaultDossier}
                  onChange={(e) => setUseDefaultDossier(e.target.checked)}
                />
                <span className="material-symbols-rounded">folder</span>
                Dossier
              </label>
              {useDefaultDossier && (
                <select
                  className="select defaults-select"
                  value={defaultDossierId}
                  onChange={(e) => setDefaultDossierId(e.target.value)}
                >
                  <option value="">Aucun dossier</option>
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="defaults-bar-item">
              <label className={`defaults-checkbox ${useDefaultDuration ? "is-active" : ""}`}>
                <input
                  type="checkbox"
                  checked={useDefaultDuration}
                  onChange={(e) => setUseDefaultDuration(e.target.checked)}
                />
                <span className="material-symbols-rounded">calendar_month</span>
                Durée
              </label>
              {useDefaultDuration && (
                <input
                  type="number"
                  className="input defaults-input-mini"
                  value={defaultDuration}
                  min={1}
                  max={60}
                  onChange={(e) => setDefaultDuration(parseInt(e.target.value) || 12)}
                />
              )}
            </div>

            <div className="defaults-bar-item">
              <label className={`defaults-checkbox ${useDefaultAddress ? "is-active" : ""}`}>
                <input
                  type="checkbox"
                  checked={useDefaultAddress}
                  onChange={(e) => setUseDefaultAddress(e.target.checked)}
                />
                <span className="material-symbols-rounded">location_on</span>
                Adresse
              </label>
              {useDefaultAddress && (
                <AutocompleteField
                  className="defaults-autocomplete"
                  value={defaultAddress}
                  onChange={setDefaultAddress}
                  items={addressItems}
                  placeholder="Adresse par défaut"
                  pinCategory="address"
                />
              )}
            </div>

            <div className="defaults-bar-item">
              <label className={`defaults-checkbox ${useDefaultAssignment ? "is-active" : ""}`}>
                <input
                  type="checkbox"
                  checked={useDefaultAssignment}
                  onChange={(e) => setUseDefaultAssignment(e.target.checked)}
                />
                <span className="material-symbols-rounded">business</span>
                Affectation
              </label>
              {useDefaultAssignment && (
                <AutocompleteField
                  className="defaults-autocomplete"
                  value={defaultAssignment}
                  onChange={setDefaultAssignment}
                  items={assignmentItems}
                  placeholder="Affectation par défaut"
                  pinCategory="assignment"
                />
              )}
            </div>

            <div className="defaults-bar-item">
              <label className={`defaults-checkbox ${useDefaultComment ? "is-active" : ""}`}>
                <input
                  type="checkbox"
                  checked={useDefaultComment}
                  onChange={(e) => setUseDefaultComment(e.target.checked)}
                />
                <span className="material-symbols-rounded">chat_bubble</span>
                Commentaire
              </label>
              {useDefaultComment && (
                <input
                  className="input defaults-input"
                  style={{ width: '180px' }}
                  value={defaultComment}
                  onChange={(e) => setDefaultComment(e.target.value)}
                  placeholder="Commentaire par défaut"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="contracts-sheet-scroll">
        <div className="contracts-sheet-grid" style={{ minWidth: `${totalWidth + STATUS_COLUMN_WIDTH}px` }}>
          <div className="contracts-sheet-header-shell">
            <div className="contracts-sheet-state-head" aria-hidden="true" />
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
                        startWidth: columnWidths[column.key]
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
            
            let syncState: SyncState = "empty";
            let label = "Vide";
            
            if (creating) {
               syncState = "saving";
               label = "Enregistrement en cours...";
            } else if (rowError) {
               syncState = "error";
               label = `Erreur: ${rowError}`;
            } else if (hasValues) {
               syncState = "unsaved";
               label = "Non synchronisé";
            }

            return (
              <div key={row.id} className="contracts-sheet-row-wrap">
                <div className={`contracts-sheet-row-shell ${creating ? "is-saving" : ""}`}>
                  {renderRowStatusIcon(syncState, label)}
                  <div
                    className={`contracts-sheet-row contracts-sheet-row-new ${creating ? "is-saving" : ""}`}
                    style={{ gridTemplateColumns }}
                  >
                    {renderNifInput(
                      rowKey,
                      0,
                      row.draft.nif,
                      (value) => setNewField(row.id, "nif", value),
                      () => {
                        void maybeCreateFromNewRow(row.id);
                      },
                      "input contracts-sheet-input"
                    )}
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={1}
                      className="input contracts-sheet-input"
                      value={row.draft.firstName}
                      placeholder="Prénom"
                      onChange={(event) => setNewField(row.id, "firstName", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 1)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={2}
                      className="input contracts-sheet-input"
                      value={row.draft.lastName}
                      placeholder="Nom"
                      onChange={(event) => setNewField(row.id, "lastName", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 2)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={3}
                      className="input contracts-sheet-input"
                      value={row.draft.gender}
                      placeholder="H / F"
                      onChange={(event) => {
                        const val = event.target.value.toUpperCase();
                        if (val === "H" || val === "HOMME") setNewField(row.id, "gender", "Homme");
                        else if (val === "F" || val === "FEMME") setNewField(row.id, "gender", "Femme");
                        else setNewField(row.id, "gender", val);
                      }}
                      onKeyDown={(event) => {
                        handleGenderShortcut(event, (value) => setNewField(row.id, "gender", value));
                        handleGridArrowNavigation(event, rowKey, 3);
                      }}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={4}
                      className="input contracts-sheet-input"
                      value={row.draft.ninu}
                      placeholder="0000000000"
                      onChange={(event) => setNewField(row.id, "ninu", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 4)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                    />
                    <AutocompleteField
                      dataSheetRow={rowKey}
                      dataSheetCol={5}
                      enableArrowNavigationInMenu={false}
                      className="input contracts-sheet-input"
                      value={row.draft.address}
                      onChange={(value) => setNewField(row.id, "address", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 5)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                      items={addressItems}
                      placeholder="Adresse"
                      featuredItem={featuredAddress}
                      pinCategory="address"
                    />
                    <AutocompleteField
                      dataSheetRow={rowKey}
                      dataSheetCol={6}
                      enableArrowNavigationInMenu={false}
                      className="input contracts-sheet-input"
                      value={row.draft.position}
                      onChange={(value) => setNewField(row.id, "position", value)}
                      onSelect={(item) => applyNewPositionSelection(row.id, item)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 6)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                      items={positionItems}
                      placeholder="Poste"
                      featuredItem={featuredPosition}
                      pinCategory="position"
                    />
                    <AutocompleteField
                      dataSheetRow={rowKey}
                      dataSheetCol={7}
                      enableArrowNavigationInMenu={false}
                      className="input contracts-sheet-input"
                      value={row.draft.assignment}
                      onChange={(value) => setNewField(row.id, "assignment", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 7)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                      items={assignmentItems}
                      placeholder="Affectation"
                      featuredItem={featuredAssignment}
                      pinCategory="assignment"
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={8}
                      className="input contracts-sheet-input"
                      value={row.draft.salaryNumber}
                      title={row.draft.salaryText}
                      placeholder="Ex: 45000"
                      inputMode="decimal"
                      onChange={(event) => setNewField(row.id, "salaryNumber", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 8)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={9}
                      className="input contracts-sheet-input"
                      value={row.draft.durationMonths}
                      placeholder="Mois"
                      type="number"
                      onChange={(event) => setNewField(row.id, "durationMonths", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 9)}
                      onBlur={() => {
                        void maybeCreateFromNewRow(row.id);
                      }}
                    />
                  </div>
                </div>
                {rowError ? <div className="contracts-sheet-inline-error">{rowError}</div> : null}
              </div>
            );
          })}

          {visibleContracts.map((contract) => {
            const rowKey = getExistingRowKey(contract.id);
            const draft = getRowDraft(contract);
            const rowError = rowErrors[contract.id];
            const saving = Boolean(savingRows[contract.id]);
            const hasChanges = !areDraftsEqual(normalizeDraft(draft), normalizeDraft(toDraft(contract)));
            
            let syncState: SyncState = "saved";
            let label = "Enregistré";
            
            if (saving) {
              syncState = "saving";
              label = "Enregistrement en cours...";
            } else if (rowError) {
              syncState = "error";
              label = `Erreur: ${rowError}`;
            } else if (hasChanges) {
              syncState = "unsaved";
              label = "Modifications non synchronisées";
            }

            return (
              <div key={contract.id} className="contracts-sheet-row-wrap">
                <div className={`contracts-sheet-row-shell ${saving ? "is-saving" : ""}`}>
                  {renderRowStatusIcon(
                    syncState,
                    label,
                    {
                      showCommentButton: true,
                      hasComment: Boolean(contract.commentaire?.trim()),
                      onCommentClick: () => openCommentDialog(contract),
                      onDeleteClick: () => {
                        if (window.confirm("Supprimer ce contrat ?")) {
                          deleteContract.mutate({ id: contract.id, workspaceId });
                        }
                      }
                    }
                  )}
                  <div
                    className={`contracts-sheet-row ${saving ? "is-saving" : ""}`}
                    style={{ gridTemplateColumns }}
                  >
                    {renderNifInput(
                      rowKey,
                      0,
                      draft.nif,
                      (value) => setExistingField(contract.id, "nif", value),
                      () => queueExistingSave(contract.id),
                      "input contracts-sheet-input"
                    )}
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={1}
                      className="input contracts-sheet-input"
                      value={draft.firstName}
                      onChange={(event) =>
                        setExistingField(contract.id, "firstName", event.target.value)
                      }
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 1)}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={2}
                      className="input contracts-sheet-input"
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
                      dataSheetRow={rowKey}
                      dataSheetCol={5}
                      enableArrowNavigationInMenu={false}
                      className="input contracts-sheet-input"
                      value={draft.address}
                      onChange={(value) => setExistingField(contract.id, "address", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 5)}
                      onBlur={() => queueExistingSave(contract.id)}
                      items={addressItems}
                      featuredItem={featuredAddress}
                      pinCategory="address"
                    />
                    <AutocompleteField
                      dataSheetRow={rowKey}
                      dataSheetCol={6}
                      enableArrowNavigationInMenu={false}
                      className="input contracts-sheet-input"
                      value={draft.position}
                      onChange={(value) => setExistingField(contract.id, "position", value)}
                      onSelect={(item) => applyPositionSelection(contract.id, item)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 6)}
                      onBlur={() => queueExistingSave(contract.id)}
                      items={positionItems}
                      featuredItem={featuredPosition}
                      pinCategory="position"
                    />
                    <AutocompleteField
                      dataSheetRow={rowKey}
                      dataSheetCol={7}
                      enableArrowNavigationInMenu={false}
                      className="input contracts-sheet-input"
                      value={draft.assignment}
                      onChange={(value) => setExistingField(contract.id, "assignment", value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 7)}
                      onBlur={() => queueExistingSave(contract.id)}
                      items={assignmentItems}
                      featuredItem={featuredAssignment}
                      pinCategory="assignment"
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={8}
                      className="input contracts-sheet-input"
                      value={draft.salaryNumber}
                      title={draft.salaryText}
                      inputMode="decimal"
                      onChange={(event) =>
                        setExistingField(contract.id, "salaryNumber", event.target.value)
                      }
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 8)}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                    <input
                      data-sheet-row={rowKey}
                      data-sheet-col={9}
                      className="input contracts-sheet-input"
                      value={draft.durationMonths}
                      placeholder="Mois"
                      type="number"
                      onChange={(event) => setExistingField(contract.id, "durationMonths", event.target.value)}
                      onKeyDown={(event) => handleGridArrowNavigation(event, rowKey, 9)}
                      onBlur={() => queueExistingSave(contract.id)}
                    />
                  </div>
                </div>
                {rowError ? <div className="contracts-sheet-inline-error">{rowError}</div> : null}
              </div>
            );
          })}

          {!isLoading && visibleContracts.length === 0 ? (
            <div className="empty-state">
              Aucun contrat existant. Utilisez les lignes vierges ci-dessus pour en créer.
            </div>
          ) : null}
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
    </div>
  );
}
