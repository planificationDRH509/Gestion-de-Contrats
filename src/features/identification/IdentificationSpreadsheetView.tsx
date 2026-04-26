import { useMemo, useRef, useState } from "react";
import { AutocompleteField, type AutocompleteItem } from "../../app/ui/AutocompleteField";
import { Gender } from "../../data/types";
import { formatFirstName, formatLastName } from "../../lib/format";
import {
  useAddresses
} from "../settings/suggestionsApi";
import {
  useIdentificationList,
  useCreateIdentification,
  useUpdateIdentification,
  useDeleteIdentification,
  IdentificationRow
} from "./identificationApi";

type SpreadsheetFieldKey = "nif" | "firstName" | "lastName" | "gender" | "ninu" | "address";

type SpreadsheetDraft = {
  nif: string;
  firstName: string;
  lastName: string;
  gender: Gender | "";
  ninu: string;
  address: string;
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
  { key: "nif", label: "NIF", width: 160, min: 140 },
  { key: "firstName", label: "Prénom", width: 160, min: 120 },
  { key: "lastName", label: "Nom", width: 160, min: 120 },
  { key: "gender", label: "Sexe", width: 100, min: 80 },
  { key: "ninu", label: "NINU", width: 160, min: 140 },
  { key: "address", label: "Adresse", width: 300, min: 200 },
];

const EMPTY_DRAFT: SpreadsheetDraft = {
  nif: "",
  firstName: "",
  lastName: "",
  gender: "",
  ninu: "",
  address: "",
};

const EMPTY_NEW_ROWS_COUNT = 5;
const NAVIGABLE_COLUMN_COUNT = 6;

function createEmptyDraft(): SpreadsheetDraft {
  return { ...EMPTY_DRAFT };
}

function createNewRow(): SpreadsheetNewRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    draft: createEmptyDraft()
  };
}

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

function toDraft(row: IdentificationRow): SpreadsheetDraft {
  return {
    nif: row.nif,
    firstName: row.prenom,
    lastName: row.nom,
    gender: (row.sexe as Gender) || "Homme",
    ninu: row.ninu || "",
    address: row.adresse,
  };
}

function isDraftEmpty(draft: SpreadsheetDraft): boolean {
  return (
    !draft.nif.trim() &&
    !draft.firstName.trim() &&
    !draft.lastName.trim() &&
    !draft.ninu.trim() &&
    !draft.address.trim()
  );
}

function normalizeDraft(draft: SpreadsheetDraft): SpreadsheetDraft {
  return {
    nif: formatNifInput(draft.nif),
    firstName: formatFirstName(draft.firstName),
    lastName: formatLastName(draft.lastName),
    gender: draft.gender === "Femme" ? "Femme" : draft.gender === "Homme" ? "Homme" : "",
    ninu: formatNinuInput(draft.ninu),
    address: draft.address.trim(),
  };
}

function validateDraft(draft: SpreadsheetDraft): string | null {
  if (!/^\d{3}-\d{3}-\d{3}-\d$/.test(draft.nif)) {
    return "NIF invalide (format attendu: XXX-XXX-XXX-X).";
  }
  if (!draft.firstName) return "Le prénom est obligatoire.";
  if (!draft.lastName) return "Le nom est obligatoire.";
  if (draft.gender !== "Homme" && draft.gender !== "Femme") return "Le sexe est obligatoire.";
  if (!draft.address) return "L'adresse est obligatoire.";
  return null;
}

export function IdentificationSpreadsheetView({ workspaceId, userId }: { workspaceId: string, userId: string }) {
  const { data: identities = [], isLoading } = useIdentificationList(workspaceId);
  const createIdentity = useCreateIdentification();
  const updateIdentity = useUpdateIdentification();
  const deleteIdentity = useDeleteIdentification();
  const { data: allAddresses = [] } = useAddresses(workspaceId);

  const [draftById, setDraftById] = useState<Record<string, SpreadsheetDraft>>({});
  const [newRows, setNewRows] = useState<SpreadsheetNewRow[]>(() =>
    Array.from({ length: EMPTY_NEW_ROWS_COUNT }, () => createNewRow())
  );
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const columnWidths = useMemo<Record<SpreadsheetFieldKey, number>>(() =>
    COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.width }), {} as any),
    []
  );

  const sheetRootRef = useRef<HTMLDivElement>(null);
  const identitiesMap = useMemo(() => new Map(identities.map(i => [i.nif, i])), [identities]);

  const addressItems: AutocompleteItem[] = useMemo(() => 
    allAddresses.map(a => ({ id: a.id, label: a.label })), [allAddresses]
  );


  function focusGridCell(rowKey: string, columnIndex: number) {
    const selector = `[data-sheet-row="${rowKey}"][data-sheet-col="${columnIndex}"]`;
    const target = sheetRootRef.current?.querySelector<HTMLElement>(selector);
    target?.focus();
  }

  function handleGridArrowNavigation(event: React.KeyboardEvent, rowKey: string, columnIndex: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      const rows = [...newRows.map(r => r.id), ...identities.map(i => i.nif)];
      const rowIndex = rows.indexOf(rowKey);
      if (rowIndex < 0) return;

      const isNewRow = rowKey.startsWith("new_");
      if (isNewRow) {
        // Move to next empty row NIF
        const nextEmpty = newRows.find((r, idx) => {
          const rIdx = rows.indexOf(r.id);
          return rIdx > rowIndex && isDraftEmpty(r.draft);
        });
        if (nextEmpty) {
          focusGridCell(nextEmpty.id, 0);
        } else {
          const nextRowKey = rows[rowIndex + 1];
          if (nextRowKey) focusGridCell(nextRowKey, 0);
        }
      } else {
        // Same column next row
        const nextRowIndex = Math.min(rows.length - 1, rowIndex + 1);
        focusGridCell(rows[nextRowIndex], columnIndex);
      }
      return;
    }

    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    
    // Simple navigation logic
    const rows = [...newRows.map(r => r.id), ...identities.map(i => i.nif)];
    const rowIndex = rows.indexOf(rowKey);
    
    let nextRowIndex = rowIndex;
    let nextColIndex = columnIndex;

    if (event.key === "ArrowUp") nextRowIndex = Math.max(0, rowIndex - 1);
    if (event.key === "ArrowDown") nextRowIndex = Math.min(rows.length - 1, rowIndex + 1);
    if (event.key === "ArrowLeft") nextColIndex = Math.max(0, columnIndex - 1);
    if (event.key === "ArrowRight") nextColIndex = Math.min(NAVIGABLE_COLUMN_COUNT - 1, columnIndex + 1);

    if (nextRowIndex !== rowIndex || nextColIndex !== columnIndex) {
      event.preventDefault();
      focusGridCell(rows[nextRowIndex], nextColIndex);
    }
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
        focusGridCell(rowId, colIndex + 1);
      });
    }
  }

  async function handleSaveNew(rowId: string) {
    const row = newRows.find(r => r.id === rowId);
    if (!row || isDraftEmpty(row.draft) || savingRows[rowId]) return;

    const candidate = normalizeDraft(row.draft);
    const error = validateDraft(candidate);
    if (error) {
      setRowErrors(prev => ({ ...prev, [rowId]: error }));
      return;
    }

    setSavingRows(prev => ({ ...prev, [rowId]: true }));
    try {
      // Check NIF uniqueness locally first if possible, but API handles it too
      await createIdentity.mutateAsync({
        nif: candidate.nif,
        prenom: candidate.firstName,
        nom: candidate.lastName,
        sexe: candidate.gender as Gender,
        ninu: candidate.ninu || null,
        adresse: candidate.address,
        workspace_id: workspaceId,
        created_by: userId
      });

      setNewRows(prev => prev.map(r => r.id === rowId ? createNewRow() : r));
      setRowErrors(prev => { const n = { ...prev }; delete n[rowId]; return n; });
    } catch (e: any) {
      setRowErrors(prev => ({ ...prev, [rowId]: e.message }));
    } finally {
      setSavingRows(prev => ({ ...prev, [rowId]: false }));
    }
  }

  async function handleSaveExisting(nif: string) {
    const draft = draftById[nif];
    if (!draft || savingRows[nif]) return;

    const candidate = normalizeDraft(draft);
    const original = toDraft(identitiesMap.get(nif)!);
    
    if (JSON.stringify(candidate) === JSON.stringify(original)) return;

    const error = validateDraft(candidate);
    if (error) {
      setRowErrors(prev => ({ ...prev, [nif]: error }));
      return;
    }

    setSavingRows(prev => ({ ...prev, [nif]: true }));
    try {
      await updateIdentity.mutateAsync({
        nif: candidate.nif,
        prenom: candidate.firstName,
        nom: candidate.lastName,
        sexe: candidate.gender as Gender,
        ninu: candidate.ninu || null,
        adresse: candidate.address,
      });
      setRowErrors(prev => { const n = { ...prev }; delete n[nif]; return n; });
    } catch (e: any) {
      setRowErrors(prev => ({ ...prev, [nif]: e.message }));
    } finally {
      setSavingRows(prev => ({ ...prev, [nif]: false }));
    }
  }

  if (isLoading) return <div className="empty-state">Chargement...</div>;

  const gridTemplateColumns = COLUMNS.map(c => `${columnWidths[c.key]}px`).join(" ");

  return (
    <div className="contracts-sheet-wrapper" ref={sheetRootRef}>
      <div className="contracts-sheet-scroll">
        <div className="contracts-sheet-grid">
          <div className="contracts-sheet-header-shell">
            <div className="contracts-sheet-state-head" />
            <div className="contracts-sheet-header" style={{ gridTemplateColumns }}>
              {COLUMNS.map(c => (
                <div key={c.key} className="contracts-sheet-head-cell">
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* New Rows */}
          {newRows.map(row => (
            <div key={row.id} className="contracts-sheet-row-wrap">
              <div className="contracts-sheet-row-shell">
                <div className="contracts-sheet-state-cell">
                  {savingRows[row.id] ? <span className="material-symbols-rounded is-spinning">sync</span> : <span className="material-symbols-rounded">add</span>}
                </div>
                <div className="contracts-sheet-row" style={{ gridTemplateColumns }}>
                  <input
                    data-sheet-row={row.id}
                    data-sheet-col={0}
                    className="input contracts-sheet-input"
                    value={row.draft.nif}
                    placeholder="000-000-000-0"
                    onChange={e => {
                      const val = formatNifInput(e.target.value);
                      setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, nif: val } } : r));
                      checkAutoNext(row.id, 0, "nif", val);
                    }}
                    onBlur={() => handleSaveNew(row.id)}
                    onKeyDown={e => handleGridArrowNavigation(e, row.id, 0)}
                  />
                  <input
                    data-sheet-row={row.id}
                    data-sheet-col={1}
                    className="input contracts-sheet-input"
                    value={row.draft.firstName}
                    placeholder="Prénom"
                    onChange={e => setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, firstName: e.target.value } } : r))}
                    onBlur={() => handleSaveNew(row.id)}
                    onKeyDown={e => handleGridArrowNavigation(e, row.id, 1)}
                  />
                  <input
                    data-sheet-row={row.id}
                    data-sheet-col={2}
                    className="input contracts-sheet-input"
                    value={row.draft.lastName}
                    placeholder="Nom"
                    onChange={e => setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, lastName: e.target.value } } : r))}
                    onBlur={() => handleSaveNew(row.id)}
                    onKeyDown={e => handleGridArrowNavigation(e, row.id, 2)}
                  />
                  <input
                    data-sheet-row={row.id}
                    data-sheet-col={3}
                    className="input contracts-sheet-input"
                    value={row.draft.gender}
                    placeholder="H / F"
                    onChange={e => {
                      const v = e.target.value.toUpperCase();
                      const gender = v.startsWith("F") ? "Femme" : v.startsWith("H") || v.startsWith("M") ? "Homme" : v;
                      setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, gender: gender as any } } : r));
                      checkAutoNext(row.id, 3, "gender", gender);
                    }}
                    onBlur={() => handleSaveNew(row.id)}
                    onKeyDown={e => {
                      if (e.key.toLowerCase() === "f") { 
                        e.preventDefault(); 
                        setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, gender: "Femme" } } : r)); 
                        checkAutoNext(row.id, 3, "gender", "Femme");
                      }
                      if (["h", "m"].includes(e.key.toLowerCase())) { 
                        e.preventDefault(); 
                        setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, gender: "Homme" } } : r)); 
                        checkAutoNext(row.id, 3, "gender", "Homme");
                      }
                      handleGridArrowNavigation(e, row.id, 3);
                    }}
                  />
                   <input
                    data-sheet-row={row.id}
                    data-sheet-col={4}
                    className="input contracts-sheet-input"
                    value={row.draft.ninu}
                    placeholder="NINU"
                    onChange={e => {
                      const val = formatNinuInput(e.target.value);
                      setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, ninu: val } } : r));
                      checkAutoNext(row.id, 4, "ninu", val);
                    }}
                    onBlur={() => handleSaveNew(row.id)}
                    onKeyDown={e => handleGridArrowNavigation(e, row.id, 4)}
                  />
                  <AutocompleteField
                    dataSheetRow={row.id}
                    dataSheetCol={5}
                    className="input contracts-sheet-input"
                    value={row.draft.address}
                    placeholder="Adresse"
                    onChange={val => setNewRows(prev => prev.map(r => r.id === row.id ? { ...r, draft: { ...r.draft, address: val } } : r))}
                    onBlur={() => handleSaveNew(row.id)}
                    onKeyDown={e => handleGridArrowNavigation(e, row.id, 5)}
                    items={addressItems}
                    pinCategory="address"
                  />
                </div>
              </div>
              {rowErrors[row.id] && <div className="contracts-sheet-inline-error">{rowErrors[row.id]}</div>}
            </div>
          ))}

          {/* Existing Rows */}
          {identities.map(identity => {
            const draft = draftById[identity.nif] || toDraft(identity);
            return (
              <div key={identity.nif} className="contracts-sheet-row-wrap">
                <div className="contracts-sheet-row-shell">
                  <div className="contracts-sheet-state-cell">
                    {savingRows[identity.nif] ? <span className="material-symbols-rounded is-spinning">sync</span> : <span className="material-symbols-rounded" style={{color: 'var(--success)'}}>check_circle</span>}
                    <button className="icon-btn" onClick={() => { if(confirm("Supprimer?")) deleteIdentity.mutate(identity.nif); }} style={{marginLeft: '4px'}}>
                      <span className="material-symbols-rounded" style={{fontSize: '16px'}}>delete</span>
                    </button>
                  </div>
                  <div className="contracts-sheet-row" style={{ gridTemplateColumns }}>
                    <input
                      data-sheet-row={identity.nif}
                      data-sheet-col={0}
                      className="input contracts-sheet-input"
                      value={draft.nif}
                      readOnly
                      style={{ opacity: 0.7 }}
                      onKeyDown={e => handleGridArrowNavigation(e, identity.nif, 0)}
                    />
                    <input
                      data-sheet-row={identity.nif}
                      data-sheet-col={1}
                      className="input contracts-sheet-input"
                      value={draft.firstName}
                      onChange={e => setDraftById(prev => ({ ...prev, [identity.nif]: { ...draft, firstName: e.target.value } }))}
                      onBlur={() => handleSaveExisting(identity.nif)}
                      onKeyDown={e => handleGridArrowNavigation(e, identity.nif, 1)}
                    />
                    <input
                      data-sheet-row={identity.nif}
                      data-sheet-col={2}
                      className="input contracts-sheet-input"
                      value={draft.lastName}
                      onChange={e => setDraftById(prev => ({ ...prev, [identity.nif]: { ...draft, lastName: e.target.value } }))}
                      onBlur={() => handleSaveExisting(identity.nif)}
                      onKeyDown={e => handleGridArrowNavigation(e, identity.nif, 2)}
                    />
                    <input
                      data-sheet-row={identity.nif}
                      data-sheet-col={3}
                      className="input contracts-sheet-input"
                      value={draft.gender}
                      onChange={e => {
                        const v = e.target.value.toUpperCase();
                        const gender = v.startsWith("F") ? "Femme" : v.startsWith("H") || v.startsWith("M") ? "Homme" : v;
                        setDraftById(prev => ({ ...prev, [identity.nif]: { ...draft, gender: gender as any } }));
                      }}
                      onBlur={() => handleSaveExisting(identity.nif)}
                      onKeyDown={e => {
                        if (e.key.toLowerCase() === "f") { e.preventDefault(); setDraftById(prev => ({ ...prev, [identity.nif]: { ...draft, gender: "Femme" } })); }
                        if (["h", "m"].includes(e.key.toLowerCase())) { e.preventDefault(); setDraftById(prev => ({ ...prev, [identity.nif]: { ...draft, gender: "Homme" } })); }
                        handleGridArrowNavigation(e, identity.nif, 3);
                      }}
                    />
                    <input
                      data-sheet-row={identity.nif}
                      data-sheet-col={4}
                      className="input contracts-sheet-input"
                      value={draft.ninu}
                      onChange={e => setDraftById(prev => ({ ...prev, [identity.nif]: { ...draft, ninu: formatNinuInput(e.target.value) } }))}
                      onBlur={() => handleSaveExisting(identity.nif)}
                      onKeyDown={e => handleGridArrowNavigation(e, identity.nif, 4)}
                    />
                    <AutocompleteField
                      dataSheetRow={identity.nif}
                      dataSheetCol={5}
                      className="input contracts-sheet-input"
                      value={draft.address}
                      onChange={val => setDraftById(prev => ({ ...prev, [identity.nif]: { ...draft, address: val } }))}
                      onBlur={() => handleSaveExisting(identity.nif)}
                      onKeyDown={e => handleGridArrowNavigation(e, identity.nif, 5)}
                      items={addressItems}
                      pinCategory="address"
                    />
                  </div>
                </div>
                {rowErrors[identity.nif] && <div className="contracts-sheet-inline-error">{rowErrors[identity.nif]}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
