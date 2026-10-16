import { editTime, localEditWins } from "../latestEdit";
import { sealLocalValue, openLocalValue } from "./deviceVault";
import type { LocalDb } from "./localDb";
import { compactContractRecord } from "./derivedContractStorage";

type Row = { key: string; value: unknown; revision?: string };
type Change = { key: string; before: unknown; after: unknown };
const DB_NAME = "contribution_records_v1";
let opened: Promise<IDBDatabase> | undefined;

function database() {
  return opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opened = undefined; reject(request.error); };
  });
}

export function flattenDatabase(db: LocalDb): Map<string, unknown> {
  const rows = new Map<string, unknown>();
  for (const [table, values] of Object.entries(db)) {
    if (table === "syncMetadata") {
      Object.entries(values).forEach(([id, value]) => rows.set(`${table}:${id}`, value));
    } else if (Array.isArray(values)) {
      values.forEach(value => {
        const id = typeof value === "string" ? value : "id" in value ? value.id : `${value.contractId}:${value.tagId}`;
        const key = `${table}:${id}`;
        rows.set(key, compactContractRecord(key, value));
      });
    }
  }
  return rows;
}

export function inflateDatabase(rows: Map<string, unknown>): LocalDb {
  const db: LocalDb = { workspaces: [], applicants: [], contracts: [], dossiers: [], tags: [],
    contractTags: [], contractLists: [], cachedListWorkspaces: [], printJobs: [], outbox: [], syncMetadata: {} };
  for (const [key, value] of rows) {
    const split = key.indexOf(":");
    const table = key.slice(0, split) as keyof LocalDb;
    if (table === "syncMetadata") db.syncMetadata[key.slice(split + 1)] = value as LocalDb["syncMetadata"][string];
    else if (Array.isArray(db[table])) (db[table] as unknown[]).push(value);
  }
  // IndexedDB returns primary-key order, not insertion order.
  db.outbox.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.sequence ?? 0) - (b.sequence ?? 0));
  return db;
}

/** Object property order is not a data change; array order remains significant. */
export function equalRecords(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => equalRecords(value, b[index]));
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(key => left[key] !== undefined);
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length &&
    keys.every(key => equalRecords(left[key], right[key]));
}
const equal = equalRecords;

export class LocalRecordConflictError extends Error {
  constructor() {
    super("Des modifications concurrentes concernent les mêmes données. Réessayez après résolution du conflit.");
    this.name = "LocalRecordConflictError";
  }
}

/** Three-way merge: dated edits converge automatically; structural conflicts stay atomic. */
export function mergeRecord(before: unknown, after: unknown, current: unknown): unknown {
  if (equal(current, before) || equal(current, after)) return after;
  if (!before && after && current && typeof after === "object" && typeof current === "object") {
    const next = after as Record<string, unknown>;
    if (editTime(next.modifiedAt) && "updatedAt" in next) {
      return localEditWins(String(next.modifiedAt), current) ? after : current;
    }
  }
  if (before && after && current && typeof before === "object" && typeof after === "object" && typeof current === "object" &&
      !Array.isArray(before) && !Array.isArray(after) && !Array.isArray(current)) {
    const base = before as Record<string, unknown>, next = after as Record<string, unknown>;
    const result = { ...current } as Record<string, unknown>;
    if (editTime(next.modifiedAt) && "updatedAt" in next) {
      if (!localEditWins(String(next.modifiedAt), result)) return current;
      // Apply only fields changed locally, keeping independent remote values.
      for (const field of new Set([...Object.keys(base), ...Object.keys(next)])) {
        if (equal(base[field], next[field])) continue;
        if (field in next) result[field] = next[field]; else delete result[field];
      }
      return result;
    }
    for (const field of new Set([...Object.keys(base), ...Object.keys(next)])) {
      if (equal(base[field], next[field])) continue;
      if (!equal(result[field], base[field]) && !equal(result[field], next[field]) && field !== "updatedAt") {
        throw new LocalRecordConflictError();
      }
      if (field in next) result[field] = next[field]; else delete result[field];
    }
    return result;
  }
  throw new LocalRecordConflictError();
}

function mergeById<T extends { id: string }>(before: T[], after: T[], current: T[]): T[] {
  const base = new Map(before.map(item => [item.id, item]));
  const next = new Map(after.map(item => [item.id, item]));
  const result = new Map(current.map(item => [item.id, item]));
  for (const id of new Set([...base.keys(), ...next.keys()])) {
    if (equal(base.get(id), next.get(id))) continue;
    const value = mergeRecord(base.get(id), next.get(id), result.get(id)) as T | undefined;
    if (value === undefined) result.delete(id); else result.set(id, value);
  }
  return [...result.values()];
}

function mergeContractRelations(before: unknown, after: unknown, current: unknown): unknown {
  if (!before || !after || !current) return mergeRecord(before, after, current);
  const base = before as LocalDb["contracts"][number];
  const next = after as typeof base, stored = current as typeof base;
  const fields = new Set([...Object.keys(base), ...Object.keys(next)] as (keyof typeof base)[]);
  const changed = [...fields].filter(field => !equal(base[field], next[field]));
  // Membership and tag operations deliberately do not advance the contract edit
  // clock. Merge their own fields instead of dropping them behind a dated edit.
  const relationEdit = base.modifiedAt === next.modifiedAt && changed.every(field =>
    ["status", "tags", "auditHistory", "updatedAt"].includes(field));
  let result = relationEdit ? { ...stored } : mergeRecord(before, after, current) as typeof base;
  if (relationEdit) {
    if (changed.includes("status")) {
      if (["deletedAt", "durationMonths", "workspaceId"].some(field =>
        !equal(base[field as keyof typeof base], stored[field as keyof typeof base]))) {
        throw new LocalRecordConflictError();
      }
      result.status = mergeRecord(base.status, next.status, stored.status) as typeof base.status;
    }
    if (changed.includes("tags")) result.tags = mergeById(base.tags ?? [], next.tags ?? [], stored.tags ?? []);
    if (changed.includes("updatedAt")) {
      result.updatedAt = editTime(next.updatedAt) > editTime(stored.updatedAt) ? next.updatedAt : stored.updatedAt;
    }
  }
  // Audit entries are append-only; concurrent independent edits must keep both.
  if (base.auditHistory && next.auditHistory && stored.auditHistory &&
      [base.auditHistory, next.auditHistory, stored.auditHistory].every(history => Array.isArray(history.entries)) &&
      base.auditHistory.entries.every(entry =>
        next.auditHistory!.entries.some(item => equal(item, entry)) && stored.auditHistory!.entries.some(item => equal(item, entry))) &&
      !equal(base.auditHistory, next.auditHistory) && !equal(base.auditHistory, stored.auditHistory)) {
    result = { ...result, auditHistory: { ...stored.auditHistory,
      entries: mergeById(base.auditHistory.entries, next.auditHistory.entries, stored.auditHistory.entries) } };
  } else if (relationEdit && changed.includes("auditHistory")) {
    result.auditHistory = mergeRecord(base.auditHistory, next.auditHistory, stored.auditHistory) as typeof base.auditHistory;
  }
  return result;
}

/** Sync status is disposable bookkeeping, never a conflict in the user's data. */
export function mergeDatabaseRecord(key: string, before: unknown, after: unknown, current: unknown): unknown {
  try {
    return key.startsWith("contracts:") ? mergeContractRelations(before, after, current) : mergeRecord(before, after, current);
  } catch (error) {
    // Two tabs can update the same timestamp while a contract and its outbox are
    // saved in this transaction. Keep the persisted status conservatively; never
    // reject those user edits or claim a newer downloaded revision on a conflict.
    if (key.startsWith("syncMetadata:") && error instanceof LocalRecordConflictError) return current;
    throw error;
  }
}

async function getRows(keys?: string[]): Promise<Row[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readonly");
    const store = transaction.objectStore("records");
    if (keys) {
      const requests = keys.map(key => store.get(key));
      transaction.oncomplete = () => resolve(requests.map(request => request.result).filter(Boolean));
    } else {
      const request = store.getAll();
      transaction.oncomplete = () => resolve(request.result);
    }
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function readRecords(): Promise<LocalDb | undefined> {
  const rows = await getRows();
  if (!rows.some(row => row.key === "ready")) return undefined;
  const decrypted = await Promise.all(rows.filter(row => row.key !== "ready").map(async row =>
    [row.key, await openLocalValue(row.value)] as const));
  const previous = new Map(decrypted);
  const compact = new Map(decrypted.map(([key, value]) => [key, compactContractRecord(key, value)]));
  if ([...previous].some(([key, value]) => !equal(value, compact.get(key)))) {
    // Migrate legacy rows atomically, preserving concurrent edits and the outbox.
    const merged = await writeRows(previous, compact);
    merged.forEach((value, key) => value === undefined ? compact.delete(key) : compact.set(key, value));
  }
  return inflateDatabase(compact);
}

/** Data and outbox changes commit atomically; only changed records are rewritten. */
export async function writeRecords(before: LocalDb | null, after: LocalDb, cacheKeys?: ReadonlySet<string>): Promise<Map<string, unknown>> {
  const previous = before ? flattenDatabase(before) : new Map<string, unknown>();
  const next = flattenDatabase(after);
  return writeRows(previous, next, cacheKeys);
}

async function writeRows(previous: Map<string, unknown>, next: Map<string, unknown>, cacheKeys?: ReadonlySet<string>): Promise<Map<string, unknown>> {
  const changes: Change[] = [...new Set([...previous.keys(), ...next.keys()])]
    .filter(key => !equal(previous.get(key), next.get(key)))
    .map(key => ({ key, before: previous.get(key), after: next.get(key) }));
  const db = await database();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = new Map((await getRows(changes.map(change => change.key))).map(row => [row.key, row]));
    const merged = new Map<string, unknown>();
    const decrypted = new Map(await Promise.all(changes.map(async change =>
      [change.key, await openLocalValue(current.get(change.key)?.value)] as const)));
    let discardCache = false;
    for (const change of changes) {
      try {
        merged.set(change.key, mergeDatabaseRecord(change.key, change.before, change.after, decrypted.get(change.key)));
      } catch (error) {
        if (!(error instanceof LocalRecordConflictError) || !cacheKeys?.has(change.key)) throw error;
        discardCache = true;
      }
    }
    // A rejected download cannot advertise its revision or overwrite unrelated
    // cache rows. Keep all user changes in the same atomic data/outbox commit.
    const prepared = await Promise.all(changes.map(async change => {
      const value = compactContractRecord(change.key,
        discardCache && cacheKeys?.has(change.key) ? decrypted.get(change.key) : merged.get(change.key));
      merged.set(change.key, value);
      return { key: change.key, value: value === undefined ? undefined : await sealLocalValue(value), revision: crypto.randomUUID() };
    }));
    const committed = await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      let concurrent = false;
      for (const row of prepared) {
        const request = store.get(row.key);
        request.onsuccess = () => {
          if (concurrent) return;
          if (request.result?.revision !== current.get(row.key)?.revision || Boolean(request.result) !== current.has(row.key)) {
            concurrent = true; transaction.abort(); return;
          }
          try {
            if (row.value === undefined) store.delete(row.key); else store.put(row);
          } catch (error) { transaction.abort(); reject(error); }
        };
      }
      try { store.put({ key: "ready", value: true }); }
      catch (error) { transaction.abort(); reject(error); }
      transaction.oncomplete = () => resolve(true);
      transaction.onabort = () => concurrent ? resolve(false) : reject(transaction.error ?? new Error("Écriture locale impossible."));
      transaction.onerror = () => reject(transaction.error);
    });
    if (committed) return merged;
  }
  throw new Error("Le stockage est occupé par un autre onglet. Réessayez.");
}
