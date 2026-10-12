import type { DataProvider } from "../../data/dataProvider";
import type { Applicant, Contract, UpdateContractInput } from "../../data/types";

export type ImportBatchEntry = {
  rowId: string;
  before: Contract | null;
  beforeApplicant?: Applicant;
  after?: Contract;
  afterApplicant?: Applicant;
  undoStarted?: boolean;
  restored?: Contract;
  undone?: boolean;
};
export type ImportBatch = { id: string; workspaceId: string; userId: string; createdAt: string; entries: ImportBatchEntry[] };
function key(workspaceId: string, userId: string, batchId: string) { return `contract_import_batch:${workspaceId}:${userId}:${batchId}`; }
export function loadImportBatch(workspaceId: string, userId: string, batchId: string): ImportBatch | null {
  const raw = localStorage.getItem(key(workspaceId, userId, batchId));
  return raw ? JSON.parse(raw) : null;
}
export function loadImportBatches(workspaceId: string, userId: string): ImportBatch[] {
  const prefix = `contract_import_batch:${workspaceId}:${userId}:`;
  return Object.keys(localStorage).filter(item => item.startsWith(prefix)).flatMap(item => {
    try { return [JSON.parse(localStorage.getItem(item)!) as ImportBatch]; } catch { return []; }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function saveBatch(batch: ImportBatch) {
  try { localStorage.setItem(key(batch.workspaceId, batch.userId, batch.id), JSON.stringify(batch)); }
  catch { throw new Error("Impossible de sauvegarder l’historique du lot. Libérez de l’espace avant de continuer."); }
}
export function recordImportEntry(workspaceId: string, userId: string, batchId: string, rowId: string, values: Partial<ImportBatchEntry>) {
  const batch = loadImportBatch(workspaceId, userId, batchId) ?? { id: batchId, workspaceId, userId, createdAt: new Date().toISOString(), entries: [] };
  const entry = batch.entries.find(item => item.rowId === rowId);
  if (entry) {
    const next = { ...values };
    // The first snapshot must survive retries after applicant writes or a lost response.
    delete next.before;
    delete next.beforeApplicant;
    Object.assign(entry, next);
  }
  else batch.entries.push({ rowId, before: null, ...values });
  saveBatch(batch);
}

const contractFields = ["id", "workspaceId", "applicantId", "dossierId", "status", "gender", "firstName", "lastName", "nif", "ninu", "address", "position", "assignment", "salaryNumber", "durationMonths", "annee_fiscale", "commentaire", "createdBy", "deletedAt"] as const;
const applicantFields = ["id", "workspaceId", "gender", "firstName", "lastName", "nif", "ninu", "address", "phone", "deletedAt"] as const;
const equalValue = (a: unknown, b: unknown) => (a ?? "") === (b ?? "");
export function sameImportContract(a: Contract, b: Contract, checkDate = true) {
  const dateChangedByUser = !checkDate && Date.parse(a.createdAt) !== Date.parse(b.createdAt) &&
    a.auditHistory?.entries.some(entry => entry.changes.some(change => change.field === "createdAt"));
  return !dateChangedByUser && contractFields.every(field => equalValue(a[field], b[field])) &&
    (!checkDate || Date.parse(a.createdAt) === Date.parse(b.createdAt)) &&
    (a.ministerId || "") === (b.ministerId || "") &&
    JSON.stringify((a.tags ?? []).map(tag => tag.id).sort()) === JSON.stringify((b.tags ?? []).map(tag => tag.id).sort());
}
function sameApplicant(a: Applicant, b: Applicant) { return applicantFields.every(field => equalValue(a[field], b[field])); }
function restoreValues(before: Contract): UpdateContractInput {
  return {
    id: before.id, workspaceId: before.workspaceId, applicantId: before.applicantId,
    dossierId: before.dossierId ?? null, status: before.status, gender: before.gender,
    firstName: before.firstName, lastName: before.lastName, nif: before.nif, ninu: before.ninu ?? null,
    address: before.address, position: before.position, assignment: before.assignment,
    salaryNumber: before.salaryNumber, durationMonths: before.durationMonths,
    annee_fiscale: before.annee_fiscale ?? null, createdAt: before.createdAt, commentaire: before.commentaire ?? null
  };
}

export async function undoContractImport(provider: Pick<DataProvider, "contracts" | "applicants" | "dossiers">, workspaceId: string, userId: string, batchId: string) {
  const batch = loadImportBatch(workspaceId, userId, batchId);
  if (!batch || batch.workspaceId !== workspaceId || batch.userId !== userId) throw new Error("Lot introuvable.");
  const undoneRowIds: string[] = [];
  const errors: string[] = [];
  for (const entry of [...batch.entries].reverse()) {
    if (!entry.after || entry.undone) continue;
    try {
      const current = await provider.contracts.getById(entry.after.id);
      const applicant = entry.beforeApplicant && entry.afterApplicant ? await provider.applicants.getById(entry.afterApplicant.id) : null;
      const applicantRestored = Boolean(applicant && entry.beforeApplicant && sameApplicant(applicant, entry.beforeApplicant));
      if (entry.beforeApplicant && entry.afterApplicant && (!applicant ||
        (!sameApplicant(applicant, entry.afterApplicant) && !(entry.undoStarted && applicantRestored)))) {
        throw new Error("La fiche d’identification a été modifiée après l’import.");
      }
      const alreadyRestored = entry.before && entry.undoStarted && current && (sameImportContract(current, entry.before) || Boolean(entry.restored && sameImportContract(current, entry.restored)));
      if (!alreadyRestored && current && !sameImportContract(current, entry.after, Boolean(entry.before))) {
        throw new Error("Le contrat a été modifié après l’import.");
      }
      if (!current && (entry.before || !entry.undoStarted)) throw new Error("Le contrat a été supprimé après l’import.");
      if (entry.before?.dossierId) {
        const folder = await provider.dossiers.getById(entry.before.dossierId);
        if (!folder || folder.deletedAt) throw new Error("Le dossier d’origine n’existe plus.");
      }
      entry.undoStarted = true;
      saveBatch(batch); // Durable intent before either write, including a lost response.
      if (current && !alreadyRestored) {
        if (entry.before) {
          entry.restored = await provider.contracts.update(restoreValues(entry.before), current);
          saveBatch(batch);
        } else await provider.contracts.softDelete(current.id, workspaceId, current);
      }
      if (applicant && entry.beforeApplicant && !applicantRestored) {
        const before = entry.beforeApplicant;
        await provider.applicants.upsert({ id: before.id, workspaceId, gender: before.gender, firstName: before.firstName,
          lastName: before.lastName, nif: before.nif, ninu: before.ninu ?? null, phone: before.phone ?? null,
          address: before.address, createdBy: before.createdBy, expectedUpdatedAt: applicant.updatedAt });
      }
      entry.undone = true;
      saveBatch(batch);
      localStorage.removeItem(`contract_import_request:${workspaceId}:${entry.rowId}`);
      undoneRowIds.push(entry.rowId);
    } catch (error) {
      errors.push(`${entry.after.firstName} ${entry.after.lastName} : ${error instanceof Error ? error.message : "Annulation impossible."}`);
    }
  }
  return { undoneRowIds, errors };
}
