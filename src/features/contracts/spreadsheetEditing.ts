import type { ComparableSpreadsheetDraft } from "./contractSpreadsheetDrafts";
import { parseImportMoney } from "./contractImport";

export type SpreadsheetDraft = ComparableSpreadsheetDraft;
export type SpreadsheetFieldKey = keyof SpreadsheetDraft;
export type SpreadsheetErrors = Partial<Record<SpreadsheetFieldKey, string>>;

export const SPREADSHEET_FIELDS: SpreadsheetFieldKey[] = [
  "nif", "firstName", "lastName", "gender", "ninu", "address", "position",
  "assignment", "salaryNumber", "durationMonths", "phone"
];

export function normalizePastedValue(field: SpreadsheetFieldKey, value: string): string {
  const trimmed = value.trim();
  if (field === "nif" && /^[\d\s-]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d)/, "$1-$2-$3-$4");
  }
  if (field === "ninu" && /^[\d\s-]+$/.test(trimmed)) return trimmed.replace(/\D/g, "");
  if (field === "gender") {
    if (/^(h|m|homme|masculin)$/i.test(trimmed)) return "Homme";
    if (/^(f|femme|féminin|feminin)$/i.test(trimmed)) return "Femme";
  }
  if (field === "salaryNumber" && /^[\d\s.,]+(?:\s*(?:HTG|Gdes))?$/i.test(trimmed)) {
    const amount = parseImportMoney(trimmed);
    if (amount !== null) return String(amount);
  }
  return trimmed;
}

export function spreadsheetErrors(draft: SpreadsheetDraft): SpreadsheetErrors {
  const errors: SpreadsheetErrors = {};
  if (!/^\d{3}-\d{3}-\d{3}-\d$/.test(normalizePastedValue("nif", draft.nif))) errors.nif = "Le NIF doit contenir 10 chiffres.";
  if (!draft.firstName.trim()) errors.firstName = "Prénom obligatoire.";
  if (!draft.lastName.trim()) errors.lastName = "Nom obligatoire.";
  if (!["Homme", "Femme"].includes(draft.gender)) errors.gender = "Choisissez Homme ou Femme.";
  if (draft.ninu && !/^\d{10}$/.test(draft.ninu)) errors.ninu = "Le NINU doit contenir 10 chiffres.";
  if (!draft.address.trim()) errors.address = "Adresse obligatoire.";
  if (!draft.position.trim()) errors.position = "Poste obligatoire.";
  if (!draft.assignment.trim()) errors.assignment = "Affectation obligatoire.";
  const salary = normalizePastedValue("salaryNumber", draft.salaryNumber);
  if (!/^\d+(?:\.\d{1,2})?$/.test(salary) || !Number.isFinite(Number(salary)) || Number(salary) <= 0) {
    errors.salaryNumber = "Saisissez un salaire valide.";
  }
  if (!/^\d+$/.test(draft.durationMonths) || Number(draft.durationMonths) < 1 || Number(draft.durationMonths) > 60) {
    errors.durationMonths = "Durée : 1 à 60 mois.";
  }
  return errors;
}

// Excel uses tabs between cells and quotes cells containing newlines or quotes.
export function parseSpreadsheetClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const value = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"' && (quoted || cell === "")) {
      if (quoted && value[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n")) {
      row.push(cell);
      cell = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("Le collage contient une cellule avec des guillemets incomplets.");
  row.push(cell);
  rows.push(row);
  while (rows.length && rows[rows.length - 1].every(value => value === "")) rows.pop();
  if (rows.length > 500) throw new Error("Collez au maximum 500 lignes à la fois.");
  return rows;
}

export type SpreadsheetChange = { rowKey: string; before: SpreadsheetDraft | null; after: SpreadsheetDraft | null; wasPasted?: boolean; isPasted?: boolean };
export type SpreadsheetEdit = { changes: SpreadsheetChange[]; focus: { rowKey: string; columnIndex: number }; group?: string };

export class SpreadsheetHistory {
  past: SpreadsheetEdit[] = [];
  future: SpreadsheetEdit[] = [];
  record(edit: SpreadsheetEdit) {
    const previous = this.past[this.past.length - 1];
    if (edit.group && previous?.group === edit.group && this.future.length === 0) {
      const changes = new Map(previous.changes.map(change => [change.rowKey, change]));
      for (const change of edit.changes) {
        changes.set(change.rowKey, { ...change, wasPasted: changes.has(change.rowKey) ? changes.get(change.rowKey)!.wasPasted : change.wasPasted, before: changes.has(change.rowKey) ? changes.get(change.rowKey)!.before : change.before });
      }
      previous.changes = [...changes.values()];
    } else this.past = [...this.past.slice(-49), edit];
    this.future = [];
  }
  undo() {
    const edit = this.past.pop();
    if (edit) this.future.push(edit);
    return edit;
  }
  redo() {
    const edit = this.future.pop();
    if (edit) this.past.push(edit);
    return edit;
  }
  // A committed row must never be recreated by undoing an older paste.
  forget(rowKey: string) {
    const prune = (edits: SpreadsheetEdit[]) => edits.map(edit => ({ ...edit, changes: edit.changes.filter(change => change.rowKey !== rowKey) })).filter(edit => edit.changes.length);
    this.past = prune(this.past);
    this.future = prune(this.future);
  }
}
