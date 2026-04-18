import { useEffect, useMemo, useRef, useState } from "react";
import { AutocompleteField, type AutocompleteItem } from "../../app/ui/AutocompleteField";
import { Contract, Gender } from "../../data/types";
import { parseMoney } from "../../lib/format";
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
  useUpdateContract
} from "./contractsApi";

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
  | "salaryText";

type SpreadsheetDraft = {
  nif: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  ninu: string;
  address: string;
  position: string;
  assignment: string;
  salaryNumber: string;
  salaryText: string;
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
  { key: "salaryText", label: "Salaire en lettre", width: 250, min: 190 }
];

const EMPTY_DRAFT: SpreadsheetDraft = {
  nif: "",
  firstName: "",
  lastName: "",
  gender: "Homme",
  ninu: "",
  address: "",
  position: "",
  assignment: "",
  salaryNumber: "",
  salaryText: ""
};

const EMPTY_NEW_ROWS_COUNT = 3;

function createEmptyDraft(): SpreadsheetDraft {
  return { ...EMPTY_DRAFT };
}

function createNewRow(): SpreadsheetNewRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    draft: createEmptyDraft()
  };
}

type ContractsSpreadsheetViewProps = {
  workspaceId: string;
  userId: string;
  contracts: Contract[];
  isLoading: boolean;
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
    assignment: contract.assignment ?? "",
    salaryNumber: contract.salaryNumber ? String(contract.salaryNumber) : "",
    salaryText: contract.salaryText ?? ""
  };
}

function isDraftEmpty(draft: SpreadsheetDraft): boolean {
  return (
    !draft.nif.trim() &&
    !draft.firstName.trim() &&
    !draft.lastName.trim() &&
    !draft.ninu.trim() &&
    !draft.address.trim() &&
    !draft.position.trim() &&
    !draft.assignment.trim() &&
    !draft.salaryNumber.trim()
  );
}

function normalizeDraft(draft: SpreadsheetDraft): SpreadsheetDraft {
  const salaryText = draft.salaryText.trim() || computeSalaryText(draft.salaryNumber);
  return {
    nif: formatNifInput(draft.nif),
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    gender: draft.gender === "Femme" ? "Femme" : "Homme",
    ninu: formatNinuInput(draft.ninu),
    address: draft.address.trim(),
    position: draft.position.trim(),
    assignment: draft.assignment.trim(),
    salaryNumber: draft.salaryNumber.trim(),
    salaryText
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
    a.salaryText === b.salaryText
  );
}

export function ContractsSpreadsheetView({
  workspaceId,
  userId,
  contracts,
  isLoading
}: ContractsSpreadsheetViewProps) {
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const upsertApplicant = useApplicantUpsert();
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
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);
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

  useEffect(() => {
    draftByIdRef.current = draftById;
  }, [draftById]);

  useEffect(() => {
    newRowsRef.current = newRows;
  }, [newRows]);

  const contractsMap = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, contract])),
    [contracts]
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
      else if (key === "gender") next.gender = value === "Femme" ? "Femme" : "Homme";
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
        else if (key === "gender") next.gender = value === "Femme" ? "Femme" : "Homme";
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
    setGender: (value: Gender) => void
  ) {
    const key = event.key.toLowerCase();
    if (key === "f") {
      event.preventDefault();
      setGender("Femme");
    }
    if (key === "m") {
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
        // No-op, next blur should retry.
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
    setSheetNotice(null);

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

      const applicant = await upsertApplicant.mutateAsync({
        id: contract.applicantId ?? undefined,
        workspaceId,
        gender: editedDraft.gender,
        firstName: editedDraft.firstName,
        lastName: editedDraft.lastName,
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
        gender: editedDraft.gender,
        firstName: editedDraft.firstName,
        lastName: editedDraft.lastName,
        nif: editedDraft.nif || null,
        ninu: editedDraft.ninu || null,
        address: editedDraft.address,
        position: editedDraft.position,
        assignment: editedDraft.assignment,
        salaryNumber: salaryNumberValue,
        salaryText: editedDraft.salaryText,
        durationMonths: contract.durationMonths || 12
      });

      setDraftById((prev) => ({ ...prev, [contractId]: editedDraft }));
      setRowErrors((prev) => {
        if (!prev[contractId]) return prev;
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
      setSheetNotice("Modification enregistrée automatiquement.");
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
    setSheetNotice(null);
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

      const applicant = await upsertApplicant.mutateAsync({
        workspaceId,
        createdBy: userId,
        gender: candidate.gender,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        nif: candidate.nif || null,
        ninu: candidate.ninu || null,
        address: candidate.address
      });

      await createContract.mutateAsync({
        workspaceId,
        createdBy: userId,
        applicantId: applicant.id,
        dossierId: null,
        status: "saisie",
        gender: candidate.gender,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        nif: candidate.nif || null,
        ninu: candidate.ninu || null,
        address: candidate.address,
        position: candidate.position,
        assignment: candidate.assignment,
        salaryNumber: salaryNumberValue,
        salaryText: candidate.salaryText,
        durationMonths: 12
      });

      setNewRows((prev) => {
        const next = prev.map((item) =>
          item.id === rowId ? createNewRow() : item
        );
        const emptyRowsCount = next.filter((item) => isDraftEmpty(item.draft)).length;
        if (emptyRowsCount < EMPTY_NEW_ROWS_COUNT) {
          const toAdd = EMPTY_NEW_ROWS_COUNT - emptyRowsCount;
          return [...next, ...Array.from({ length: toAdd }, () => createNewRow())];
        }
        return next;
      });
      setSheetNotice("Nouveau contrat enregistré automatiquement.");
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

  function renderNifInput(
    value: string,
    onChange: (value: string) => void,
    onBlur: () => void,
    rowClassName: string,
    ref?: React.RefObject<HTMLInputElement>
  ) {
    return (
      <input
        ref={ref}
        className={rowClassName}
        value={value}
        placeholder="000-000-000-0"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    );
  }

  if (isLoading) {
    return <div className="empty-state">Chargement des contrats…</div>;
  }

  return (
    <div className="contracts-sheet-wrapper">
      <div className="contracts-sheet-toolbar">
        <div className="helper-text">
          Vue tableur active · autosave à la sortie de cellule · nouvelles lignes vierges en bas
        </div>
        {sheetNotice ? <div className="contracts-sheet-notice">{sheetNotice}</div> : null}
      </div>

      <div className="contracts-sheet-scroll">
        <div className="contracts-sheet-grid" style={{ minWidth: `${totalWidth}px` }}>
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

          {contracts.map((contract) => {
            const draft = getRowDraft(contract);
            const rowError = rowErrors[contract.id];
            const saving = Boolean(savingRows[contract.id]);

            return (
              <div key={contract.id} className="contracts-sheet-row-wrap">
                <div
                  className={`contracts-sheet-row ${saving ? "is-saving" : ""}`}
                  style={{ gridTemplateColumns }}
                >
                  {renderNifInput(
                    draft.nif,
                    (value) => setExistingField(contract.id, "nif", value),
                    () => queueExistingSave(contract.id),
                    "input contracts-sheet-input"
                  )}
                  <input
                    className="input contracts-sheet-input"
                    value={draft.firstName}
                    onChange={(event) =>
                      setExistingField(contract.id, "firstName", event.target.value)
                    }
                    onBlur={() => queueExistingSave(contract.id)}
                  />
                  <input
                    className="input contracts-sheet-input"
                    value={draft.lastName}
                    onChange={(event) =>
                      setExistingField(contract.id, "lastName", event.target.value)
                    }
                    onBlur={() => queueExistingSave(contract.id)}
                  />
                  <select
                    className="select contracts-sheet-input"
                    value={draft.gender}
                    onChange={(event) =>
                      setExistingField(contract.id, "gender", event.target.value)
                    }
                    onKeyDown={(event) =>
                      handleGenderShortcut(event, (value) =>
                        setExistingField(contract.id, "gender", value)
                      )
                    }
                    onBlur={() => queueExistingSave(contract.id)}
                  >
                    <option value="Homme">Homme</option>
                    <option value="Femme">Femme</option>
                  </select>
                  <input
                    className="input contracts-sheet-input"
                    value={draft.ninu}
                    onChange={(event) =>
                      setExistingField(contract.id, "ninu", event.target.value)
                    }
                    onBlur={() => queueExistingSave(contract.id)}
                  />
                  <AutocompleteField
                    className="input contracts-sheet-input"
                    value={draft.address}
                    onChange={(value) => setExistingField(contract.id, "address", value)}
                    onBlur={() => queueExistingSave(contract.id)}
                    items={addressItems}
                    featuredItem={featuredAddress}
                    pinCategory="address"
                  />
                  <AutocompleteField
                    className="input contracts-sheet-input"
                    value={draft.position}
                    onChange={(value) => setExistingField(contract.id, "position", value)}
                    onSelect={(item) => applyPositionSelection(contract.id, item)}
                    onBlur={() => queueExistingSave(contract.id)}
                    items={positionItems}
                    featuredItem={featuredPosition}
                    pinCategory="position"
                  />
                  <AutocompleteField
                    className="input contracts-sheet-input"
                    value={draft.assignment}
                    onChange={(value) => setExistingField(contract.id, "assignment", value)}
                    onBlur={() => queueExistingSave(contract.id)}
                    items={assignmentItems}
                    featuredItem={featuredAssignment}
                    pinCategory="assignment"
                  />
                  <input
                    className="input contracts-sheet-input"
                    value={draft.salaryNumber}
                    inputMode="decimal"
                    onChange={(event) =>
                      setExistingField(contract.id, "salaryNumber", event.target.value)
                    }
                    onBlur={() => queueExistingSave(contract.id)}
                  />
                  <input
                    className="input contracts-sheet-input contracts-sheet-input-readonly"
                    value={draft.salaryText}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                {rowError ? <div className="contracts-sheet-inline-error">{rowError}</div> : null}
              </div>
            );
          })}

          {newRows.map((row) => {
            const rowError = newRowErrors[row.id];
            const creating = Boolean(creatingRows[row.id]);

            return (
              <div key={row.id} className="contracts-sheet-row-wrap">
                <div
                  className={`contracts-sheet-row contracts-sheet-row-new ${creating ? "is-saving" : ""}`}
                  style={{ gridTemplateColumns }}
                >
                  {renderNifInput(
                    row.draft.nif,
                    (value) => setNewField(row.id, "nif", value),
                    () => {
                      void maybeCreateFromNewRow(row.id);
                    },
                    "input contracts-sheet-input"
                  )}
                  <input
                    className="input contracts-sheet-input"
                    value={row.draft.firstName}
                    placeholder="Prénom"
                    onChange={(event) => setNewField(row.id, "firstName", event.target.value)}
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                  />
                  <input
                    className="input contracts-sheet-input"
                    value={row.draft.lastName}
                    placeholder="Nom"
                    onChange={(event) => setNewField(row.id, "lastName", event.target.value)}
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                  />
                  <select
                    className="select contracts-sheet-input"
                    value={row.draft.gender}
                    onChange={(event) => setNewField(row.id, "gender", event.target.value)}
                    onKeyDown={(event) =>
                      handleGenderShortcut(event, (value) => setNewField(row.id, "gender", value))
                    }
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                  >
                    <option value="Homme">Homme</option>
                    <option value="Femme">Femme</option>
                  </select>
                  <input
                    className="input contracts-sheet-input"
                    value={row.draft.ninu}
                    placeholder="0000000000"
                    onChange={(event) => setNewField(row.id, "ninu", event.target.value)}
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                  />
                  <AutocompleteField
                    className="input contracts-sheet-input"
                    value={row.draft.address}
                    onChange={(value) => setNewField(row.id, "address", value)}
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                    items={addressItems}
                    placeholder="Adresse"
                    featuredItem={featuredAddress}
                    pinCategory="address"
                  />
                  <AutocompleteField
                    className="input contracts-sheet-input"
                    value={row.draft.position}
                    onChange={(value) => setNewField(row.id, "position", value)}
                    onSelect={(item) => applyNewPositionSelection(row.id, item)}
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                    items={positionItems}
                    placeholder="Poste"
                    featuredItem={featuredPosition}
                    pinCategory="position"
                  />
                  <AutocompleteField
                    className="input contracts-sheet-input"
                    value={row.draft.assignment}
                    onChange={(value) => setNewField(row.id, "assignment", value)}
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                    items={assignmentItems}
                    placeholder="Affectation"
                    featuredItem={featuredAssignment}
                    pinCategory="assignment"
                  />
                  <input
                    className="input contracts-sheet-input"
                    value={row.draft.salaryNumber}
                    placeholder="Ex: 45000"
                    inputMode="decimal"
                    onChange={(event) => setNewField(row.id, "salaryNumber", event.target.value)}
                    onBlur={() => {
                      void maybeCreateFromNewRow(row.id);
                    }}
                  />
                  <input
                    className="input contracts-sheet-input contracts-sheet-input-readonly"
                    value={row.draft.salaryText}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                {rowError ? <div className="contracts-sheet-inline-error">{rowError}</div> : null}
              </div>
            );
          })}

          {!isLoading && contracts.length === 0 ? (
            <div className="empty-state">
              Aucun contrat existant. Utilisez les lignes vierges ci-dessus pour en créer.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
