import { withBrowserLock } from "../../lib/browserLock";
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
import { get, del } from "idb-keyval";
import { readRecords, writeRecords, flattenDatabase, inflateDatabase, mergeRecord } from "./recordStore";
import type { ContractList } from "../../features/lists/listModel";

export type LocalSyncMetadata = {
  remoteRevision?: string | null;
  lastSyncedAt?: string | null;
  lastFullSyncedAt?: string | null;
  lastError?: string | null;
};

export type LocalDb = {
  contractLists: ContractList[];
  cachedListWorkspaces: string[];
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
let persistedDb: LocalDb | null = null;
let persistenceError: Error | null = null;
let channel: BroadcastChannel | undefined;
let memoryRevision = 0;
const snapshotBases = new WeakMap<LocalDb, LocalDb>();
export function getLocalStorageError() { return persistenceError?.message ?? null; }

function notifyStorage() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("contribution-offline-sync"));
}

export async function refreshLocalDb(): Promise<void> {
  await flushLocalDbWrites();
  if (typeof indexedDB === "undefined") return;
  const revision = memoryRevision;
  const stored = await readRecords();
  if (!stored) return;
  // Never replace a new edit made while the IndexedDB read was in flight.
  if (revision !== memoryRevision || pendingPersistenceSnapshot || persistenceDrainScheduled) return;
  memoryDb = normalizeDb(stored);
  persistedDb = memoryDb;
}


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
    contractLists: [],
    cachedListWorkspaces: [],
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
    contractLists: Array.isArray(value.contractLists) ? value.contractLists : [],
    cachedListWorkspaces: Array.isArray(value.cachedListWorkspaces) ? value.cachedListWorkspaces : [],
    workspaces: Array.isArray(value.workspaces) ? value.workspaces : [],
    applicants: Array.isArray(value.applicants)
      ? value.applicants.map((applicant) => ({
          ...applicant,
          phone: applicant.phone ?? null
        }))
      : [],
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
          salaryText: numberToFrenchWords(contract.salaryNumber),
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
    outbox: Array.isArray(value.outbox) ? value.outbox.flatMap((item, index) => {
      item = { ...item, sequence: item.sequence ?? index };
      // Legacy bulk edits did not capture base versions. Split them so each can
      // be compared and resolved independently instead of blindly replayed.
      const p = item.payload;
      if (item.type === "contract.update" && !p.id && !p.status && Array.isArray(p.contractIds)) {
        return p.contractIds.map((id, index) => ({ ...item, id: `${item.id}:${id}`,
          sequence: (item.sequence ?? 0) + index / (p.contractIds as unknown[]).length,
          payload: { id, ...(typeof p.durationMonths === "number" ? { durationMonths: p.durationMonths } : { dossierId: p.dossierId }) }
        }));
      }
      return [item];
    }) : [],
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
  pendingPersistenceSnapshot = db;
  if (persistenceDrainScheduled) return persistenceQueue;
  persistenceDrainScheduled = true;
  persistenceQueue = persistenceQueue.catch(() => undefined).then(async () => {
    while (pendingPersistenceSnapshot) {
      const snapshot = pendingPersistenceSnapshot;
      pendingPersistenceSnapshot = null;
      try {
        if (typeof indexedDB === "undefined") {
          if (import.meta.env.MODE !== "test") throw new Error("Le stockage sécurisé de cet appareil est indisponible.");
          localStorage.setItem(DB_KEY, JSON.stringify(inflateDatabase(flattenDatabase(snapshot))));
        } else {
          const merged = await writeRecords(persistedDb, snapshot);
          const rows = flattenDatabase(snapshot);
          merged.forEach((value, key) => value === undefined ? rows.delete(key) : rows.set(key, value));
          persistedDb = normalizeDb(inflateDatabase(rows));
          if (memoryDb === snapshot) memoryDb = persistedDb;
          else if (pendingPersistenceSnapshot) {
            const oldRows = flattenDatabase(snapshot), pendingRows = flattenDatabase(pendingPersistenceSnapshot);
            const rebased = flattenDatabase(persistedDb);
            for (const key of new Set([...oldRows.keys(), ...pendingRows.keys()])) {
              const before = oldRows.get(key), after = pendingRows.get(key);
              if (JSON.stringify(before) === JSON.stringify(after)) continue;
              const value = mergeRecord(before, after, rebased.get(key));
              if (value === undefined) rebased.delete(key); else rebased.set(key, value);
            }
            pendingPersistenceSnapshot = normalizeDb(inflateDatabase(rebased));
            memoryDb = pendingPersistenceSnapshot;
          }
        }
        persistenceError = null;
        channel?.postMessage("changed");
      } catch (error) {
        pendingPersistenceSnapshot = pendingPersistenceSnapshot ?? snapshot;
        persistenceError = error instanceof Error ? error : new Error("Enregistrement local impossible.");
        notifyStorage();
        throw persistenceError;
      }
    }
  }).finally(() => {
    persistenceDrainScheduled = false;
    if (pendingPersistenceSnapshot && !persistenceError) void queueIndexedDbWrite(pendingPersistenceSnapshot);
  });
  // Background cache writes have no caller; mutations observe the same error via flush.
  void persistenceQueue.catch(() => undefined);
  return persistenceQueue;
}

/**
 * Hydrates the synchronous repository snapshot from IndexedDB before React starts.
 * Existing localStorage data is migrated once, then only a tiny readiness marker
 * remains in localStorage so the offline database is not constrained by its quota.
 */
let initialization: Promise<void> | null = null;
export function initializeLocalDb(): Promise<void> {
  if (memoryDb) return Promise.resolve();
  return initialization ??= withBrowserLock("local-db-init", initializeDatabase).finally(() => { initialization = null; });
}

async function initializeDatabase(): Promise<void> {
  if (memoryDb) return;
  let stored: LocalDb | undefined;
  if (typeof indexedDB !== "undefined") {
    stored = await readRecords();
    if (stored) persistedDb = normalizeDb(stored);
    else stored = await get<LocalDb>(IDB_KEY);
  }
  memoryDb = normalizeDb(stored ?? loadLegacyDb() ?? seedDatabase());
  if (!persistedDb) {
    await queueIndexedDbWrite(memoryDb);
    if (typeof indexedDB !== "undefined") await del(IDB_KEY);
  }
  if (typeof indexedDB !== "undefined") localStorage.removeItem(DB_KEY);
  localStorage.setItem(INIT_MARKER_KEY, "1");
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("contribution-local-db");
    channel.onmessage = () => { void refreshLocalDb().then(notifyStorage).catch(() => undefined); };
  }
  // Browser eviction is less likely once persistent storage has been granted.
  void navigator.storage?.persist?.().catch(() => false);
}

function getMemoryDb(): LocalDb {
  // Vitest clears localStorage between tests while retaining ES modules.
  if (import.meta.env.MODE === "test" && !localStorage.getItem(INIT_MARKER_KEY)) {
    memoryDb = null;
    persistedDb = null;
    pendingPersistenceSnapshot = null;
    persistenceError = null;
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
  const base = getMemoryDb();
  const copy = cloneDb(base);
  snapshotBases.set(copy, base);
  return copy;
}

/**
 * Reads and clones only the selected offline data instead of cloning the whole
 * database. Selectors must remain pure and must not mutate the supplied value.
 */
export function selectDb<T>(selector: (db: LocalDb) => T): T {
  return cloneValue(selector(getMemoryDb()));
}

export function saveDb(db: LocalDb) {
  const base = snapshotBases.get(db);
  if (base && memoryDb && base !== memoryDb) {
    const before = flattenDatabase(base), after = flattenDatabase(db), current = flattenDatabase(memoryDb);
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      if (JSON.stringify(before.get(key)) === JSON.stringify(after.get(key))) continue;
      const value = mergeRecord(before.get(key), after.get(key), current.get(key));
      if (value === undefined) current.delete(key); else current.set(key, value);
    }
    db = inflateDatabase(current);
  }
  memoryRevision += 1;
  memoryDb = normalizeDb(cloneDb(db));
  localStorage.setItem(INIT_MARKER_KEY, "1");
  void queueIndexedDbWrite(memoryDb);
}

export async function flushLocalDbWrites(): Promise<void> {
  if (pendingPersistenceSnapshot && !persistenceDrainScheduled) void queueIndexedDbWrite(pendingPersistenceSnapshot);
  do { await persistenceQueue; } while (persistenceDrainScheduled || pendingPersistenceSnapshot);
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
