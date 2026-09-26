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

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Three-way merge: unrelated edits survive, divergent edits are rejected atomically. */
export function mergeRecord(before: unknown, after: unknown, current: unknown): unknown {
  if (equal(current, before) || equal(current, after)) return after;
  if (before && after && current && typeof before === "object" && typeof after === "object" && typeof current === "object") {
    const base = before as Record<string, unknown>, next = after as Record<string, unknown>;
    const result = { ...current } as Record<string, unknown>;
    for (const field of new Set([...Object.keys(base), ...Object.keys(next)])) {
      if (equal(base[field], next[field])) continue;
      if (!equal(result[field], base[field]) && !equal(result[field], next[field]) && field !== "updatedAt") {
        throw new Error("Ces données ont changé dans un autre onglet. Actualisez avant de réessayer.");
      }
      if (field in next) result[field] = next[field]; else delete result[field];
    }
    return result;
  }
  throw new Error("Ces données ont changé dans un autre onglet. Actualisez avant de réessayer.");
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
export async function writeRecords(before: LocalDb | null, after: LocalDb): Promise<Map<string, unknown>> {
  const previous = before ? flattenDatabase(before) : new Map<string, unknown>();
  const next = flattenDatabase(after);
  return writeRows(previous, next);
}

async function writeRows(previous: Map<string, unknown>, next: Map<string, unknown>): Promise<Map<string, unknown>> {
  const changes: Change[] = [...new Set([...previous.keys(), ...next.keys()])]
    .filter(key => !equal(previous.get(key), next.get(key)))
    .map(key => ({ key, before: previous.get(key), after: next.get(key) }));
  const db = await database();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = new Map((await getRows(changes.map(change => change.key))).map(row => [row.key, row]));
    const merged = new Map<string, unknown>();
    const prepared = await Promise.all(changes.map(async change => {
      const value = compactContractRecord(change.key,
        mergeRecord(change.before, change.after, await openLocalValue(current.get(change.key)?.value)));
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
