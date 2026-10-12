import { loadImportBatch, recordImportEntry } from "./contractImportBatch";
import type { DataProvider } from "../../data/dataProvider";
import type { Contract, CreateContractInput, UpdateContractInput, UpsertApplicantInput } from "../../data/types";
import { identityDigits } from "../../data/contractIdentity";
import { getContractFiscalYear } from "../../lib/contractDateFilters";
import { createId } from "../../lib/uuid";
import { migrateLegacyContract, readMinistersCache } from "../settings/ministersCache";
import { findImportDuplicate, getContractImportIdentityIssues, type ContractImportDraft } from "./contractImport";

export type ContractImportProgress = { phase: "applicants" | "contracts"; completed: number; total: number };
export type ImportRowResult = { contractId: string; contract?: Contract; error?: string };
export type ImportRunInput = {
  workspaceId: string;
  batchId?: string;
  userId?: string;
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
type ImportRequest = CreateContractInput & { duplicateUpdate?: UpdateContractInput; applicantUpdate?: UpsertApplicantInput };
export function readImportRequest(workspaceId: string, id: string): ImportRequest | null {
  const raw = localStorage.getItem(journalKey(workspaceId, id));
  return raw ? migrateLegacyContract(JSON.parse(raw) as CreateContractInput) : null;
}
export function confirmImportReceipt(workspaceId: string, id: string) {
  localStorage.removeItem(journalKey(workspaceId, id));
}

function saveRequest(input: ImportRequest) {
  try { localStorage.setItem(journalKey(input.workspaceId, input.id!), JSON.stringify(input)); }
  catch { throw new Error("Impossible de sauvegarder la reprise de l’import. Libérez de l’espace avant de réessayer."); }
}

function duplicateUpdateApplied(contract: Contract | null | undefined, request: ImportRequest) {
  const patch = request.duplicateUpdate;
  return Boolean(contract && !contract.deletedAt && patch && contract.workspaceId === request.workspaceId &&
    Date.parse(contract.createdAt) === Date.parse(patch.createdAt!) &&
    contract.dossierId === patch.dossierId &&
    (patch.commentaire === undefined || contract.commentaire === patch.commentaire));
}

function previousContractNote(contract: Contract) {
  const values = [
    ["Contrat", contract.id], ["Nom", contract.lastName], ["Prénom", contract.firstName],
    ["Sexe", contract.gender], ["NIF", contract.nif || contract.applicantId], ["NINU", contract.ninu],
    ["Adresse", contract.address], ["Poste", contract.position], ["Affectation", contract.assignment],
    ["Salaire", contract.salaryNumber], ["Durée (mois)", contract.durationMonths],
    ["Année fiscale", getContractFiscalYear(contract)], ["Statut", contract.status],
    ["Dossier", contract.dossierId], ["Créé le", contract.createdAt], ["Modifié le", contract.updatedAt],
    ["Responsable", contract.createdBy], ["Ministre", contract.minister?.fullName || contract.ministerId],
    ["Commentaire", contract.commentaire]
  ];
  return ["Ancien contrat remplacé à l’import", ...values.map(([label, value]) => `${label} : ${value ?? "—"}`)].join("\n");
}

export async function runContractImport(provider: ImportProvider, input: ImportRunInput) {
  const registry = readMinistersCache();
  const minister = registry?.ministers.find(m => m.id === registry.currentMinisterId);
  const { workspaceId, responsibleUserId, fiscalYear, onRowResult, onProgress } = input;
  const record = (rowId: string, values: Parameters<typeof recordImportEntry>[4]) => {
    if (input.batchId && input.userId) recordImportEntry(workspaceId, input.userId, input.batchId, rowId, values);
  };
  const receipt = (rowId: string, contract: Contract) => {
    const prepared = input.batchId && input.userId && loadImportBatch(workspaceId, input.userId, input.batchId)?.entries.some(entry => entry.rowId === rowId);
    if (prepared) record(rowId, { after: contract });
    onRowResult?.({ contractId: rowId, contract });
  };
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
    const request = readImportRequest(workspaceId, row.contractId);
    if (request?.duplicateUpdate) return true; // An existing ID alone is never an update receipt.
    const contract = recovered.get(row.contractId);
    if (!contract) return true;
    if (contract.deletedAt || contract.workspaceId !== workspaceId || identityDigits(contract.nif || contract.applicantId) !== identityDigits(row.nif) || getContractFiscalYear(contract) !== fiscalYear) {
      const failure = { contractId: row.contractId, error: `Ligne ${row.sourceRowNumber ?? ""} : la référence de reprise correspond à un autre contrat.` };
      failures.push(failure);
      onRowResult?.(failure);
      return false;
    }
    contracts.push(contract);
    receipt(row.contractId, contract);
    return false;
  });
  const issues = getContractImportIdentityIssues(pending.map(row => row.duplicateResolution?.action === "keep" ? { nif: "", ninu: null } : row), applicants);
  const counts = new Map<string, number>();
  pending.forEach(row => { const key = identityDigits(row.nif); counts.set(key, (counts.get(key) ?? 0) + 1); });
  const blockedIds = new Set<string>();
  pending.forEach((row, index) => {
    const key = identityDigits(row.nif);
    const errors = [...issues[index].errors];
    if ((counts.get(key) ?? 0) > 1) errors.push(`Le NIF ${row.nif} est répété dans la sélection.`);
    const duplicate = previousContracts.find(contract => !contract.deletedAt && identityDigits(contract.nif || contract.applicantId) === key && getContractFiscalYear(contract) === fiscalYear && contract.id !== row.contractId);
    if (duplicate && duplicate.id !== row.duplicateResolution?.contractId) errors.push(`Le NIF ${row.nif} possède déjà un contrat pour ${fiscalYear} (${duplicate.id}).`);
    if (row.duplicateResolution && (!duplicate || duplicate.id !== row.duplicateResolution.contractId)) errors.push("Le contrat en doublon a changé. Choisissez à nouveau le contrat à conserver.");
    const request = readImportRequest(workspaceId, row.contractId);
    if (request && (request.annee_fiscale !== fiscalYear || identityDigits(request.nif) !== key)) errors.push("Les références de cette ligne ne correspondent plus à la tentative précédente.");
    if (errors.length) {
      blockedIds.add(row.contractId);
      const failure = { contractId: row.contractId, error: `Ligne ${row.sourceRowNumber ?? index + 1} : ${errors.join(" ")}` };
      failures.push(failure);
      onRowResult?.(failure);
    }
  });
  let dossierId = input.dossierId;
  let createdDossierId: string | null = null;
  const dossierJournalKey = `contract_import_dossier:${workspaceId}:${rows[0].contractId}`;
  let uncertainOutcome = false;
  for (const row of pending.filter(row => !blockedIds.has(row.contractId))) {
    let request = readImportRequest(workspaceId, row.contractId);
    try {
      // Recover a lost acknowledgement before writing anything again.
      if (request) {
        let saved: Contract | null;
        try { saved = await provider.contracts.getById(request.duplicateUpdate?.id ?? row.contractId); }
        catch (error) { uncertainOutcome = true; throw error; }
        if (saved && (!request.duplicateUpdate || duplicateUpdateApplied(saved, request))) {
          contracts.push(saved);
          receipt(row.contractId, saved);
          continue;
        }
        dossierId = request.dossierId ?? dossierId;
      }
      const existing = applicants.find(applicant => identityDigits(applicant.nif || applicant.id) === identityDigits(row.nif));
      if (!request) {
        const duplicate = row.duplicateResolution ? findImportDuplicate(row, previousContracts, fiscalYear) : undefined;
        // Keep a snapshot before the shared applicant record is updated.
        const oldNote = duplicate && row.duplicateResolution?.action === "replace" ? previousContractNote(duplicate) : "";
        onProgress?.({ phase: "applicants", completed: contracts.length, total: rows.length });
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
          ...(minister ? { ministerId: minister.id, minister } : {}),
          id: row.contractId, workspaceId, annee_fiscale: fiscalYear, applicantId: row.nif, dossierId,
          status: "saisie", gender: row.gender, firstName: row.firstName, lastName: row.lastName,
          nif: row.nif, ninu: row.ninu, address: row.address, position: row.position, assignment: row.assignment,
          salaryNumber: row.salaryNumber, salaryText: row.salaryText, durationMonths: row.durationMonths,
          commentaire: row.commentaire, createdBy: responsibleUserId
        };
        if (duplicate) {
          const refreshedAt = new Date().toISOString();
          request.duplicateUpdate = row.duplicateResolution?.action === "keep"
            ? { id: duplicate.id, workspaceId, dossierId, annee_fiscale: fiscalYear, createdAt: refreshedAt }
            : {
                id: duplicate.id, workspaceId, dossierId, annee_fiscale: fiscalYear, createdAt: refreshedAt, status: "saisie",
                gender: row.gender, firstName: row.firstName, lastName: row.lastName,
                nif: row.nif, ninu: row.ninu, address: row.address, position: row.position,
                assignment: row.assignment, salaryNumber: row.salaryNumber, durationMonths: row.durationMonths,
                commentaire: [row.commentaire, oldNote].filter(Boolean).join("\n\n")
              };
        }
        if (row.duplicateResolution?.action !== "keep") request.applicantUpdate = {
          id: existing?.id, workspaceId, gender: row.gender, firstName: row.firstName, lastName: row.lastName,
          nif: row.nif, ninu: row.ninu, address: row.address, phone: row.phone,
          createdBy: existing ? existing.createdBy : responsibleUserId
        };
        record(row.contractId, { before: duplicate ?? null, beforeApplicant: request.applicantUpdate ? existing : undefined });
        saveRequest(request);
      }
      if (request.applicantUpdate) {
        try {
          const savedApplicant = await provider.applicants.upsert(request.applicantUpdate);
          record(row.contractId, { afterApplicant: savedApplicant });
        }
        catch (error) {
          throw error;
        }
      }
      let contract: Contract;
      try {
        if (request.duplicateUpdate) {
          const current = await provider.contracts.getById(request.duplicateUpdate.id);
          if (!current || current.deletedAt || current.workspaceId !== workspaceId ||
            identityDigits(current.nif || current.applicantId) !== identityDigits(row.nif) || getContractFiscalYear(current) !== fiscalYear) {
            throw new Error("Le contrat en doublon n’est plus disponible pour cet import.");
          }
          contract = await provider.contracts.update(request.duplicateUpdate);
        } else {
          const { applicantUpdate: _applicant, duplicateUpdate: _duplicate, ...createInput } = request;
          contract = await provider.contracts.create(createInput);
        }
      }
      catch (error) {
        let saved: Contract | null;
        try { saved = await provider.contracts.getById(request.duplicateUpdate?.id ?? row.contractId); }
        catch {
          uncertainOutcome = true;
          throw error;
        }
        if (!saved || (request.duplicateUpdate && !duplicateUpdateApplied(saved, request))) {
          if (!request.duplicateUpdate) localStorage.removeItem(journalKey(workspaceId, row.contractId));
          throw error;
        }
        contract = saved;
      }
      contracts.push(contract);
      receipt(row.contractId, contract);
    } catch (error) {
      const failure = { contractId: row.contractId, error: `Ligne ${row.sourceRowNumber ?? ""} — ${error instanceof Error ? error.message : "Échec de l’enregistrement."}` };
      if (request?.duplicateUpdate) uncertainOutcome = true;
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
