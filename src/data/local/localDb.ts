import {
  Applicant,
  Contract,
  ContractPrintJob,
  Dossier,
  OutboxItem,
  Tag,
  Workspace
} from "../types";
import { createId } from "../../lib/uuid";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import {
  normalizeDossierStatus,
  normalizeNonNegativeInteger,
  normalizeOptionalDate,
  normalizeOptionalText
} from "../../lib/dossier";
import { get, set } from "idb-keyval";

export type LocalSyncMetadata = {
  lastSyncedAt?: string | null;
  lastFullSyncedAt?: string | null;
  lastError?: string | null;
};

export type LocalDb = {
  workspaces: Workspace[];
  applicants: Applicant[];
  dossiers: Dossier[];
  contracts: Contract[];
  tags: Tag[];
  contractTags: Array<{ contractId: string; tagId: string; createdAt: string }>;
  printJobs: ContractPrintJob[];
  outbox: OutboxItem[];
  syncMetadata: Record<string, LocalSyncMetadata>;
};

const DB_KEY = "contribution_local_db";
const IDB_KEY = "contribution_offline_database_v2";
const INIT_MARKER_KEY = "contribution_offline_database_ready";
export const DEFAULT_WORKSPACE_ID = "workspace_default";

let memoryDb: LocalDb | null = null;
let persistenceQueue: Promise<void> = Promise.resolve();
let pendingPersistenceSnapshot: LocalDb | null = null;
let persistenceDrainScheduled = false;

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
    tags: [],
    contractTags: [],
    printJobs: [],
    outbox: [],
    syncMetadata: {}
  };
}

function normalizeDb(value: LocalDb): LocalDb {
  return {
    ...value,
    workspaces: Array.isArray(value.workspaces) ? value.workspaces : [],
    applicants: Array.isArray(value.applicants) ? value.applicants : [],
    dossiers: Array.isArray(value.dossiers)
        ? value.dossiers.map((dossier) => ({
          ...dossier,
          status: normalizeDossierStatus(dossier.status),
          isEphemeral: dossier.isEphemeral ?? false,
          priority: dossier.priority ?? "normal",
          contractTargetCount: normalizeNonNegativeInteger(dossier.contractTargetCount),
          comment: normalizeOptionalText(dossier.comment),
          deadlineDate: normalizeOptionalDate(dossier.deadlineDate),
          focalPoint: normalizeOptionalText(dossier.focalPoint),
          roadmapSheetNumber: normalizeOptionalText(dossier.roadmapSheetNumber),
          defaultDurationMonths: dossier.defaultDurationMonths ?? null,
          createdBy: dossier.createdBy ?? null
        }))
      : [],
    contracts: Array.isArray(value.contracts)
      ? value.contracts.map((contract) => ({
          ...contract,
          dossierId: contract.dossierId ?? null,
          durationMonths: contract.durationMonths ?? 12,
          tags: Array.isArray(contract.tags)
            ? contract.tags.map((tag) => ({
                ...tag,
                workspaceId: tag.workspaceId ?? contract.workspaceId,
                color: tag.color || "#64748b",
                createdAt: tag.createdAt ?? contract.createdAt ?? now(),
                updatedAt: tag.updatedAt ?? contract.updatedAt ?? now()
              }))
            : undefined
        }))
      : [],
    tags: Array.isArray(value.tags)
      ? value.tags.map((tag) => ({
          ...tag,
          workspaceId: tag.workspaceId ?? DEFAULT_WORKSPACE_ID,
          color: tag.color || "#64748b",
          updatedAt: tag.updatedAt ?? tag.createdAt ?? now(),
          createdAt: tag.createdAt ?? now()
        }))
      : [],
    contractTags: Array.isArray(value.contractTags) ? value.contractTags : [],
    printJobs: Array.isArray(value.printJobs) ? value.printJobs : [],
    outbox: Array.isArray(value.outbox) ? value.outbox : [],
    syncMetadata:
      value.syncMetadata && typeof value.syncMetadata === "object"
        ? value.syncMetadata
        : {}
  };
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneDb(db: LocalDb): LocalDb {
  return cloneValue(db);
}

function loadLegacyDb(): LocalDb | null {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? normalizeDb(JSON.parse(raw) as LocalDb) : null;
  } catch {
    return null;
  }
}

function queueIndexedDbWrite(db: LocalDb): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve();
  }

  // Keep only the newest immutable snapshot while a write is in progress. A
  // workspace refresh can update several pages in quick succession; persisting
  // every intermediate full database made the UI noticeably sluggish.
  pendingPersistenceSnapshot = db;
  if (persistenceDrainScheduled) {
    return persistenceQueue;
  }

  persistenceDrainScheduled = true;
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(async () => {
      while (pendingPersistenceSnapshot) {
        const snapshot = pendingPersistenceSnapshot;
        pendingPersistenceSnapshot = null;
        await set(IDB_KEY, snapshot);
      }
    })
    .finally(() => {
      persistenceDrainScheduled = false;
      if (pendingPersistenceSnapshot) {
        void queueIndexedDbWrite(pendingPersistenceSnapshot);
      }
    });
  return persistenceQueue;
}

/**
 * Hydrates the synchronous repository snapshot from IndexedDB before React starts.
 * Existing localStorage data is migrated once, then only a tiny readiness marker
 * remains in localStorage so the offline database is not constrained by its quota.
 */
export async function initializeLocalDb(): Promise<void> {
  if (memoryDb) return;

  let stored: LocalDb | undefined;
  if (typeof indexedDB !== "undefined") {
    try {
      stored = await get<LocalDb>(IDB_KEY);
    } catch {
      // Private browsing or a denied IndexedDB falls back to the legacy store.
    }
  }

  const legacy = loadLegacyDb();
  memoryDb = normalizeDb(stored ?? legacy ?? seedDatabase());

  try {
    if (typeof indexedDB !== "undefined") {
      // Existing IndexedDB content has already been persisted. Avoid rewriting
      // the complete offline database on every launch before React can render.
      if (!stored) {
        await set(IDB_KEY, cloneDb(memoryDb));
      }
      localStorage.removeItem(DB_KEY);
    }
    localStorage.setItem(INIT_MARKER_KEY, "1");
  } catch {
    // The in-memory database still keeps the current session usable.
  }
}

function getMemoryDb(): LocalDb {
  // Vitest clears localStorage between tests while retaining ES modules.
  if (import.meta.env.MODE === "test" && !localStorage.getItem(INIT_MARKER_KEY)) {
    memoryDb = null;
  }

  if (!memoryDb) {
    memoryDb = loadLegacyDb() ?? seedDatabase();
    try {
      localStorage.setItem(INIT_MARKER_KEY, "1");
    } catch {
      // Ignore storage failures; callers can still use the in-memory snapshot.
    }
    void queueIndexedDbWrite(memoryDb);
  }
  return memoryDb;
}

export function loadDb(): LocalDb {
  return cloneDb(getMemoryDb());
}

/**
 * Reads and clones only the selected offline data instead of cloning the whole
 * database. Selectors must remain pure and must not mutate the supplied value.
 */
export function selectDb<T>(selector: (db: LocalDb) => T): T {
  return cloneValue(selector(getMemoryDb()));
}

export function saveDb(db: LocalDb) {
  memoryDb = normalizeDb(cloneDb(db));
  try {
    localStorage.setItem(INIT_MARKER_KEY, "1");
    if (typeof indexedDB === "undefined") {
      localStorage.setItem(DB_KEY, JSON.stringify(memoryDb));
    } else {
      localStorage.removeItem(DB_KEY);
    }
  } catch {
    // IndexedDB remains the primary persistence mechanism.
  }
  void queueIndexedDbWrite(memoryDb);
}

export async function flushLocalDbWrites(): Promise<void> {
  do {
    await persistenceQueue;
  } while (persistenceDrainScheduled || pendingPersistenceSnapshot);
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
