import {
  Applicant,
  Contract,
  ContractPrintJob,
  Dossier,
  OutboxItem,
  Workspace
} from "../types";
import { createId } from "../../lib/uuid";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import {
  normalizeNonNegativeInteger,
  normalizeOptionalDate,
  normalizeOptionalText
} from "../../lib/dossier";

export type LocalDb = {
  workspaces: Workspace[];
  applicants: Applicant[];
  dossiers: Dossier[];
  contracts: Contract[];
  printJobs: ContractPrintJob[];
  outbox: OutboxItem[];
};

const DB_KEY = "contribution_local_db";
export const DEFAULT_WORKSPACE_ID = "workspace_default";

function now() {
  return new Date().toISOString();
}

function seedDatabase(): LocalDb {
  const workspace: Workspace = {
    id: DEFAULT_WORKSPACE_ID,
    name: "Planification",
    createdAt: now(),
    updatedAt: now()
  };

  const workspaceMouvement: Workspace = {
    id: "workspace_mouvement",
    name: "Mouvement",
    createdAt: now(),
    updatedAt: now()
  };

  const workspaceAvantages: Workspace = {
    id: "workspace_avantages",
    name: "Avantages Sociaux",
    createdAt: now(),
    updatedAt: now()
  };

  const applicantId = createId();
  const applicant: Applicant = {
    id: applicantId,
    workspaceId: workspace.id,
    gender: "Femme",
    firstName: "Nadine",
    lastName: "Pierre",
    nif: "",
    ninu: "",
    address: "12, Rue des Palmes, Port-au-Prince",
    createdAt: now(),
    updatedAt: now()
  };

  const contract: Contract = {
    id: createId(),
    workspaceId: workspace.id,
    dossierId: null,
    applicantId,
    status: "final",
    gender: applicant.gender,
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    nif: applicant.nif,
    ninu: applicant.ninu,
    address: applicant.address,
    position: "Assistante administrative",
    assignment: "Direction générale",
    salaryNumber: 45000,
    salaryText: numberToFrenchWords(45000),
    durationMonths: 12,
    createdAt: now(),
    updatedAt: now()
  };

  return {
    workspaces: [workspace, workspaceMouvement, workspaceAvantages],
    applicants: [applicant],
    dossiers: [],
    contracts: [contract],
    printJobs: [],
    outbox: []
  };
}

function normalizeDb(value: LocalDb): LocalDb {
  return {
    ...value,
    workspaces: Array.isArray(value.workspaces) ? value.workspaces : [],
    dossiers: Array.isArray(value.dossiers)
      ? value.dossiers.map((dossier) => ({
          ...dossier,
          isEphemeral: dossier.isEphemeral ?? false,
          priority: dossier.priority ?? "normal",
          contractTargetCount: normalizeNonNegativeInteger(dossier.contractTargetCount),
          comment: normalizeOptionalText(dossier.comment),
          deadlineDate: normalizeOptionalDate(dossier.deadlineDate),
          focalPoint: normalizeOptionalText(dossier.focalPoint),
          roadmapSheetNumber: normalizeOptionalText(dossier.roadmapSheetNumber)
        }))
      : [],
    contracts: Array.isArray(value.contracts)
      ? value.contracts.map((contract) => ({
          ...contract,
          dossierId: contract.dossierId ?? null,
          durationMonths: contract.durationMonths ?? 12
        }))
      : [],
    printJobs: Array.isArray(value.printJobs) ? value.printJobs : [],
    outbox: Array.isArray(value.outbox) ? value.outbox : []
  };
}

export function loadDb(): LocalDb {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const seeded = seedDatabase();
    localStorage.setItem(DB_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const parsed = JSON.parse(raw) as LocalDb;
  const normalized = normalizeDb(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    saveDb(normalized);
  }
  return normalized;
}

export function saveDb(db: LocalDb) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function listWorkspaces(): Workspace[] {
  ensureDefaultWorkspace();
  return loadDb().workspaces;
}

export function ensureDefaultWorkspace(): Workspace {
  const db = loadDb();
  
  const defaults = [
    { id: "workspace_default", name: "Planification" },
    { id: "workspace_mouvement", name: "Mouvement" },
    { id: "workspace_avantages", name: "Avantages Sociaux" },
  ];

  let changed = false;

  const initialLength = db.workspaces.length;
  
  // Ensure defaults exist and have correct names
  defaults.forEach(def => {
    const existing = db.workspaces.find(w => w.id === def.id);
    if (!existing) {
      db.workspaces.push({
        id: def.id,
        name: def.name,
        createdAt: now(),
        updatedAt: now()
      });
      changed = true;
    } else if (existing.name !== def.name) {
      existing.name = def.name;
      changed = true;
    }
  });

  // Remove my previous experimental ones if they exist
  const oldIds = ["workspace_reception", "workspace_compta", "workspace_gen"];
  db.workspaces = db.workspaces.filter(w => !oldIds.includes(w.id));
  if (db.workspaces.length !== initialLength) {
    changed = true;
  }

  if (changed) saveDb(db);
  
  return db.workspaces.find(w => w.id === DEFAULT_WORKSPACE_ID)!;
}
