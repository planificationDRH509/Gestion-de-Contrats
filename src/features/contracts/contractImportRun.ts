import type { DataProvider } from "../../data/dataProvider";
import type { Contract, CreateContractInput } from "../../data/types";
import { identityDigits } from "../../data/contractIdentity";
import { getContractFiscalYear } from "../../lib/contractDateFilters";
import { createId } from "../../lib/uuid";
import { getContractImportIdentityIssues, type ContractImportDraft } from "./contractImport";

export type ContractImportProgress = { phase: "applicants" | "contracts"; completed: number; total: number };
export type ImportRowResult = { contractId: string; contract?: Contract; error?: string };
export type ImportRunInput = {
  workspaceId: string;
  dossierId: string | null;
  responsibleUserId: string;
  fiscalYear: string;
  rows: ContractImportDraft[];
  onProgress?: (progress: ContractImportProgress) => void;
  onDossierCreated?: (dossierId: string) => void;
  onRowResult?: (result: ImportRowResult) => void;
};

type ImportProvider = Pick<DataProvider, "applicants" | "contracts" | "dossiers">;

export async function loadImportContracts(provider: Pick<DataProvider, "contracts">, workspaceId: string) {
  return (await provider.contracts.list({ workspaceId, all: true, dateFilterMode: "all", sort: "createdAt_desc" })).items;
}

// Persist the exact request before sending it. A retry after an unknown outcome
// reuses both the same ID and payload, even if the response was lost.
function journalKey(workspaceId: string, id: string) { return `contract_import_request:${workspaceId}:${id}`; }
export function readImportRequest(workspaceId: string, id: string): CreateContractInput | null {
  const raw = localStorage.getItem(journalKey(workspaceId, id));
  return raw ? JSON.parse(raw) as CreateContractInput : null;
}
export function confirmImportReceipt(workspaceId: string, id: string) {
  localStorage.removeItem(journalKey(workspaceId, id));
}

function saveRequest(input: CreateContractInput) {
  try { localStorage.setItem(journalKey(input.workspaceId, input.id!), JSON.stringify(input)); }
  catch { throw new Error("Impossible de sauvegarder la reprise de l’import. Libérez de l’espace avant de réessayer."); }
}

export async function runContractImport(provider: ImportProvider, input: ImportRunInput) {
  const { workspaceId, responsibleUserId, fiscalYear, onRowResult, onProgress } = input;
  const rows = input.rows.map(row => ({ ...row, contractId: row.contractId || createId() }));
  const contracts: Contract[] = [];
  const failures: ImportRowResult[] = [];
  if (!rows.length) return { contracts, failures };
  const [applicants, previousContracts] = await Promise.all([
    provider.applicants.findManyByNifOrNinu(workspaceId, rows.map(row => row.nif), rows.flatMap(row => row.ninu ? [row.ninu] : [])),
    loadImportContracts(provider, workspaceId)
  ]);
  const recovered = new Map(previousContracts.map(contract => [contract.id, contract]));
  // getByIds also finds a saved request that was omitted by a stale list.
  const attemptedIds = rows.filter(row => readImportRequest(workspaceId, row.contractId)).map(row => row.contractId);
  if (attemptedIds.length) {
    for (const contract of await provider.contracts.getByIds(attemptedIds, workspaceId)) recovered.set(contract.id, contract);
  }
  const pending = rows.filter(row => {
    const contract = recovered.get(row.contractId);
    if (!contract) return true;
    if (contract.deletedAt || contract.workspaceId !== workspaceId || identityDigits(contract.nif || contract.applicantId) !== identityDigits(row.nif) || getContractFiscalYear(contract) !== fiscalYear) {
      throw new Error(`Ligne ${row.sourceRowNumber ?? ""} : la référence de reprise correspond à un autre contrat.`);
    }
    contracts.push(contract);
    onRowResult?.({ contractId: row.contractId, contract });
    return false;
  });
  const issues = getContractImportIdentityIssues(pending, applicants);
  const seen = new Set<string>();
  pending.forEach((row, index) => {
    const key = identityDigits(row.nif);
    const errors = [...issues[index].errors];
    if (seen.has(key)) errors.push(`Le NIF ${row.nif} est répété dans la sélection.`);
    seen.add(key);
    const duplicate = previousContracts.find(contract => !contract.deletedAt && identityDigits(contract.nif || contract.applicantId) === key && getContractFiscalYear(contract) === fiscalYear && contract.id !== row.contractId);
    if (duplicate) errors.push(`Le NIF ${row.nif} possède déjà un contrat pour ${fiscalYear} (${duplicate.id}).`);
    const request = readImportRequest(workspaceId, row.contractId);
    if (request && (request.annee_fiscale !== fiscalYear || identityDigits(request.nif) !== key)) errors.push("Les références de cette ligne ne correspondent plus à la tentative précédente.");
    if (errors.length) throw new Error(`Ligne ${row.sourceRowNumber ?? index + 1} : ${errors.join(" ")}`);
  });
  let dossierId = input.dossierId;
  let createdDossierId: string | null = null;
  const dossierJournalKey = `contract_import_dossier:${workspaceId}:${rows[0].contractId}`;
  let uncertainOutcome = false;
  for (const row of pending) {
    let request = readImportRequest(workspaceId, row.contractId);
    try {
      // Recover a lost acknowledgement before writing anything again.
      if (request) {
        let saved: Contract | null;
        try { saved = await provider.contracts.getById(row.contractId); }
        catch (error) { uncertainOutcome = true; throw error; }
        if (saved) {
          contracts.push(saved);
          onRowResult?.({ contractId: row.contractId, contract: saved });
          continue;
        }
        dossierId = request.dossierId ?? dossierId;
      }
      const existing = applicants.find(applicant => identityDigits(applicant.nif || applicant.id) === identityDigits(row.nif));
      if (!request) {
        onProgress?.({ phase: "applicants", completed: contracts.length, total: rows.length });
        await provider.applicants.upsert({
          id: existing?.id, workspaceId, gender: row.gender, firstName: row.firstName, lastName: row.lastName,
          nif: row.nif, ninu: row.ninu, address: row.address, phone: row.phone,
          createdBy: existing ? existing.createdBy : responsibleUserId
        });
        if (!dossierId) {
          const baseName = `${rows[0].lastName} ${rows[0].firstName}`.trim();
          const names = new Set((await provider.dossiers.list(workspaceId)).filter(dossier => !dossier.deletedAt).map(dossier => dossier.name.toLocaleLowerCase()));
          let name = baseName;
          for (let suffix = 2; names.has(name.toLocaleLowerCase()); suffix++) name = `${baseName} (${suffix})`;
          const requestedId = localStorage.getItem(dossierJournalKey) || createId();
          localStorage.setItem(dossierJournalKey, requestedId);
          const previous = await provider.dossiers.getById(requestedId);
          const dossierInput = { id: requestedId, workspaceId, name, createdBy: responsibleUserId };
          const dossier = previous && !previous.deletedAt ? previous : await provider.dossiers.create(dossierInput);
          dossierId = dossier.id;
          // Some providers reuse an existing same-name folder. Never delete it.
          if (dossier.id === requestedId) createdDossierId = dossier.id;
          input.onDossierCreated?.(dossier.id);
        }
        request = {
          id: row.contractId, workspaceId, annee_fiscale: fiscalYear, applicantId: row.nif, dossierId,
          status: "saisie", gender: row.gender, firstName: row.firstName, lastName: row.lastName,
          nif: row.nif, ninu: row.ninu, address: row.address, position: row.position, assignment: row.assignment,
          salaryNumber: row.salaryNumber, salaryText: row.salaryText, durationMonths: row.durationMonths,
          commentaire: row.commentaire, createdBy: responsibleUserId
        };
        saveRequest(request);
      }
      let contract: Contract;
      try { contract = await provider.contracts.create(request); }
      catch (error) {
        let saved: Contract | null;
        try { saved = await provider.contracts.getById(row.contractId); }
        catch {
          uncertainOutcome = true;
          throw error;
        }
        if (!saved) {
          localStorage.removeItem(journalKey(workspaceId, row.contractId));
          throw error;
        }
        contract = saved;
      }
      contracts.push(contract);
      onRowResult?.({ contractId: row.contractId, contract });
    } catch (error) {
      const failure = { contractId: row.contractId, error: `Ligne ${row.sourceRowNumber ?? ""} — ${error instanceof Error ? error.message : "Échec de l’enregistrement."}` };
      failures.push(failure);
      onRowResult?.(failure);
    }
    onProgress?.({ phase: "contracts", completed: contracts.length, total: rows.length });
  }
  if (createdDossierId && contracts.length === 0 && !uncertainOutcome) {
    try {
      const contents = await provider.contracts.list({ workspaceId, dossierId: createdDossierId, all: true, dateFilterMode: "all" });
      if (contents.total === 0 && contents.items.length === 0) {
        await provider.dossiers.delete(createdDossierId, workspaceId);
        localStorage.removeItem(dossierJournalKey);
        input.onDossierCreated?.("");
      }
    } catch { /* Keep the dossier when emptiness cannot be established. */ }
  }
  return { contracts, failures };
}
