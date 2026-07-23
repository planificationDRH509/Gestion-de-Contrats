import fs from "node:fs";
import path from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

type RawRecord = Record<string, unknown>;

type AuditValue = string | number | boolean | null;

type AuditActor = {
  id?: string | null;
  name: string;
  role?: string | null;
};

type AuditChange = {
  field: string;
  previousValue: AuditValue;
  newValue: AuditValue;
};

type HistoryPayload = {
  version: 2;
  createdAt: string;
  createdBy: AuditActor;
  entries: Array<{
    id: string;
    action: "creation" | "modification" | "status" | "dossier" | "duration" | "comment" | "deletion";
    at: string;
    actor: AuditActor;
    changes: AuditChange[];
  }>;
};

type ContractDateShape = {
  createdAt: string;
  updatedAt: string;
  durationMonths: number;
};

type ContractDateFilterMode =
  | "all"
  | "day"
  | "range"
  | "week"
  | "month"
  | "fiscal_year_current";

type ContractListPayload = {
  workspaceId: string;
  query?: string;
  sort?: "createdAt_desc" | "createdAt_asc" | "name_asc" | "name_desc";
  page?: number;
  pageSize?: number;
  status?: string;
  dossierId?: string | null;
  dateFilterMode?: ContractDateFilterMode;
  dateFilterDate?: string;
  dateFilterStart?: string;
  dateFilterEnd?: string;
  tagId?: string;
  assignments?: string[];
  positions?: string[];
};

type ContractRow = {
  id_contrat: string;
  workspace_id: string;
  dossier_id: string | null;
  nif: string;
  status: string;
  duree_contrat: number;
  salaire_en_chiffre: number;
  salaire: string;
  titre: string;
  lieu_affectation: string;
  annee_fiscale: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  historique_saisie: string;
  commentaire: string | null;
  created_by: string | null;
  nom: string;
  prenom: string;
  sexe: "Homme" | "Femme";
  ninu: string | null;
  adresse: string;
};

type TagRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API_PREFIX = "/api/local";
const SQLITE_FILENAME = "contribution.sqlite";
const WORKSPACES = [
  { id: "workspace_default", name: "Planification" },
  { id: "workspace_mouvement", name: "Mouvement" },
  { id: "workspace_avantages", name: "Avantages Sociaux" }
] as const;
const ALLOWED_STATUSES = new Set([
  "draft",
  "final",
  "saisie",
  "correction",
  "impression_partiel",
  "imprime",
  "signe",
  "transfere",
  "classe"
]);

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asInteger(value: unknown, fallback = 0): number {
  const parsed = Math.trunc(asNumber(value, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBody(req: IncomingMessage): Promise<RawRecord> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        const parsed = JSON.parse(raw) as RawRecord;
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new HttpError(400, "Corps JSON invalide."));
      }
    });
    req.on("error", () => reject(new HttpError(400, "Requête invalide.")));
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function respondError(res: ServerResponse, error: unknown) {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Erreur interne SQLite locale.";
  sendJson(res, 500, { error: message });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }

  const text = String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

function parseDateInput(value: string): Date | null {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isDateInRange(date: Date, startInclusive: Date, endExclusive: Date): boolean {
  return date >= startInclusive && date < endExclusive;
}

function getContractActivityDate(contract: ContractDateShape): Date {
  const created = toValidDate(contract.createdAt) ?? new Date();
  const updated = toValidDate(contract.updatedAt);
  if (updated && updated.getTime() > created.getTime()) {
    return updated;
  }
  return created;
}

function getContractStartDate(contract: ContractDateShape): Date {
  const createdAt = toValidDate(contract.createdAt) ?? new Date();

  let endYear = createdAt.getFullYear();
  if (createdAt.getMonth() >= 9) {
    endYear += 1;
  }

  const durationMonths = contract.durationMonths ?? 12;
  const targetStartMonth = 8 - durationMonths + 1;
  const startDate = new Date(endYear, targetStartMonth, 1);
  while (startDate.getDay() !== 1) {
    startDate.setDate(startDate.getDate() + 1);
  }

  return startDate;
}

function getCurrentFiscalYearStart(now = new Date()): Date {
  const fiscalStartYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(fiscalStartYear, 9, 1);
}

function matchesContractDateFilter(
  contract: ContractDateShape,
  mode: ContractDateFilterMode | undefined,
  options: {
    dayDateInput?: string;
    rangeStartInput?: string;
    rangeEndInput?: string;
    now?: Date;
  } = {}
): boolean {
  if (!mode || mode === "all") {
    return true;
  }

  const now = options.now ?? new Date();

  if (mode === "fiscal_year_current") {
    const contractStart = getContractStartDate(contract);
    const fiscalStart = startOfDay(getCurrentFiscalYearStart(now));
    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isDateInRange(contractStart, fiscalStart, tomorrow);
  }

  const activityDate = getContractActivityDate(contract);
  const todayStart = startOfDay(now);

  if (mode === "day") {
    const explicitDay = options.dayDateInput ? parseDateInput(options.dayDateInput) : null;
    const dayStart = explicitDay ? startOfDay(explicitDay) : todayStart;
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    return isDateInRange(activityDate, dayStart, nextDay);
  }

  if (mode === "range") {
    const explicitStart = options.rangeStartInput ? parseDateInput(options.rangeStartInput) : null;
    const explicitEnd = options.rangeEndInput ? parseDateInput(options.rangeEndInput) : null;

    if (!explicitStart && !explicitEnd) {
      return true;
    }

    const startBoundary = explicitStart ? startOfDay(explicitStart) : null;
    const endBoundary = explicitEnd ? startOfDay(explicitEnd) : null;

    if (startBoundary && activityDate < startBoundary) {
      return false;
    }

    if (endBoundary) {
      const nextDay = new Date(endBoundary);
      nextDay.setDate(nextDay.getDate() + 1);
      if (activityDate >= nextDay) {
        return false;
      }
    }

    return true;
  }

  if (mode === "week") {
    const dayOfWeek = todayStart.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return isDateInRange(activityDate, weekStart, nextWeek);
  }

  if (mode === "month") {
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const nextMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);
    return isDateInRange(activityDate, monthStart, nextMonth);
  }

  return true;
}

function contractMatchesQuery(
  contract: ReturnType<typeof mapContract>,
  query: string
): boolean {
  const normalizedQuery = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalizedQuery) return true;

  const values = [
    contract.firstName,
    contract.lastName,
    contract.nif ?? "",
    contract.ninu ?? "",
    contract.position,
    contract.assignment
  ];
  const queryDigits = query.replace(/\D/g, "");
  if (queryDigits && !normalizedQuery.replace(/\d/g, "").trim()) {
    return values.some((value) => value.replace(/\D/g, "").includes(queryDigits));
  }

  const searchableText = values
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ");
  return normalizedQuery.split(/\s+/).every((token) => searchableText.includes(token));
}

function sortContracts(
  contracts: Array<ReturnType<typeof mapContract>>,
  sort?: ContractListPayload["sort"]
) {
  const sorted = [...contracts];
  switch (sort) {
    case "createdAt_asc":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "name_asc":
      return sorted.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    case "name_desc":
      return sorted.sort((a, b) => `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`));
    case "createdAt_desc":
    default:
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function fiscalYearFor(date: Date) {
  const startYear = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  const endYear = startYear + 1;
  const code = `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
  const label = `${startYear}-${endYear}`;
  return { code, label };
}

function parseHistory(value: string | null): HistoryPayload {
  const fallbackActor = { name: "Administrateur" };
  if (!value) {
    return {
      version: 2,
      createdAt: nowIso(),
      createdBy: fallbackActor,
      entries: []
    };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed?.version === 2 && Array.isArray(parsed.entries)) {
      return {
        version: 2,
        createdAt: asString(parsed.createdAt) || nowIso(),
        createdBy: normalizeAuditActor(parsed.createdBy, fallbackActor),
        entries: parsed.entries
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => {
            const item = entry as Record<string, unknown>;
            return {
              id: asString(item.id) || randomUUID(),
              action: normalizeAuditAction(item.action),
              at: asString(item.at) || nowIso(),
              actor: normalizeAuditActor(item.actor, fallbackActor),
              changes: Array.isArray(item.changes)
                ? item.changes
                    .filter((change) => change && typeof change === "object")
                    .map((change) => {
                      const auditChange = change as Record<string, unknown>;
                      return {
                        field: asString(auditChange.field),
                        previousValue: asAuditValue(auditChange.previousValue),
                        newValue: asAuditValue(auditChange.newValue)
                      };
                    })
                    .filter((change) => change.field)
                : []
            };
          })
      };
    }

    const createdAt = asString(parsed?.createdAt) || nowIso();
    const createdBy = normalizeAuditActor(parsed?.createdBy, fallbackActor);
    const legacyUpdates = Array.isArray(parsed?.updates) ? parsed.updates : [];
    return {
      version: 2,
      createdAt,
      createdBy,
      entries: legacyUpdates
        .filter((update) => update && typeof update === "object")
        .map((update) => {
          const item = update as Record<string, unknown>;
          return {
            id: randomUUID(),
            action: "modification" as const,
            at: asString(item.updatedAt) || createdAt,
            actor: normalizeAuditActor(item.updatedBy, createdBy),
            changes: Array.isArray(item.changes)
              ? item.changes
                  .map((field) => asString(field))
                  .filter(Boolean)
                  .map((field) => ({
                    field,
                    previousValue: null,
                    newValue: null
                  }))
              : []
          };
        })
    };
  } catch {
    return {
      version: 2,
      createdAt: nowIso(),
      createdBy: fallbackActor,
      entries: []
    };
  }
}

function asAuditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

function normalizeAuditActor(value: unknown, fallback: AuditActor): AuditActor {
  if (typeof value === "string") {
    return { name: value.trim() || fallback.name };
  }
  if (!value || typeof value !== "object") return fallback;
  const actor = value as Record<string, unknown>;
  return {
    id: asNullableString(actor.id),
    name: asString(actor.name).trim() || fallback.name,
    role: asNullableString(actor.role)
  };
}

function normalizeAuditAction(value: unknown): HistoryPayload["entries"][number]["action"] {
  const action = asString(value);
  if (
    action === "creation" ||
    action === "modification" ||
    action === "status" ||
    action === "dossier" ||
    action === "duration" ||
    action === "comment" ||
    action === "deletion"
  ) {
    return action;
  }
  return "modification";
}

function appendHistoryEntry(
  history: HistoryPayload,
  actor: AuditActor,
  action: HistoryPayload["entries"][number]["action"],
  changes: AuditChange[],
  at = nowIso()
) {
  if (changes.length === 0 && action !== "deletion") return;
  history.entries.push({
    id: randomUUID(),
    action,
    at,
    actor,
    changes
  });
}

function mapApplicant(row: RawRecord) {
  return {
    id: asString(row.nif),
    workspaceId: asString(row.workspace_id),
    gender: asString(row.sexe) as "Homme" | "Femme",
    firstName: asString(row.prenom),
    lastName: asString(row.nom),
    nif: asString(row.nif),
    ninu: asNullableString(row.ninu),
    address: asString(row.adresse),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at)
  };
}

function mapDossier(row: RawRecord) {
  return {
    id: asString(row.id),
    workspaceId: asString(row.workspace_id),
    name: asString(row.name),
    status: asString(row.status) === "classified" ? "classified" : "active",
    isEphemeral: Number(row.is_ephemeral) === 1,
    priority: asString(row.priority) as "normal" | "urgence",
    contractTargetCount: asInteger(row.contract_target_count, 0),
    comment: asNullableString(row.comment),
    deadlineDate: asNullableString(row.deadline_date),
    focalPoint: asNullableString(row.focal_point),
    roadmapSheetNumber: asNullableString(row.roadmap_sheet_number),
    defaultDurationMonths: asInteger(row.default_duration_months, 0) || null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
    createdBy: asNullableString(row.created_by)
  };
}

function mapContract(row: ContractRow) {
  return {
    id: row.id_contrat,
    workspaceId: row.workspace_id,
    dossierId: row.dossier_id,
    applicantId: row.nif,
    status: row.status,
    gender: row.sexe,
    firstName: row.prenom,
    lastName: row.nom,
    nif: row.nif,
    ninu: row.ninu,
    address: row.adresse,
    position: row.titre,
    assignment: row.lieu_affectation,
    salaryNumber: row.salaire_en_chiffre,
    salaryText: row.salaire,
    durationMonths: row.duree_contrat,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    createdBy: row.created_by,
    commentaire: row.commentaire,
    auditHistory: parseHistory(row.historique_saisie),
    tags: getTagsForContract(row.id_contrat)
  };
}

function mapTag(row: TagRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    createdBy: row.created_by
  };
}

function getTagsForContract(contractId: string) {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT t.*
      FROM tags t
      INNER JOIN contract_tags ct ON ct.tag_id = t.id
      WHERE ct.contract_id = :contract_id
        AND t.deleted_at IS NULL
      ORDER BY t.name COLLATE NOCASE ASC
    `)
    .all({ contract_id: contractId }) as TagRow[];

  return rows.map(mapTag);
}

function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function tagColor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash}, 70%, 42%)`;
}

function getDbFilePath(): string {
  const fromEnv = process.env.CONTRIBUTION_SQLITE_PATH;
  if (fromEnv?.trim()) {
    return path.resolve(process.cwd(), fromEnv.trim());
  }
  return path.resolve(process.cwd(), ".local-data", SQLITE_FILENAME);
}

function ensureDir(filePath: string) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

let cachedDb: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (cachedDb) {
    return cachedDb;
  }

  const filePath = getDbFilePath();
  ensureDir(filePath);
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS identification (
      nif TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      sexe TEXT NOT NULL CHECK (sexe IN ('Homme','Femme')),
      ninu TEXT UNIQUE,
      adresse TEXT NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS identification_workspace_idx
      ON identification (workspace_id);

    CREATE INDEX IF NOT EXISTS identification_name_idx
      ON identification (workspace_id, nom, prenom);

    CREATE INDEX IF NOT EXISTS identification_ninu_idx
      ON identification (workspace_id, ninu);

    CREATE TABLE IF NOT EXISTS dossiers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      id_contrat TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','classified')),
      is_ephemeral INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgence')),
      contract_target_count INTEGER NOT NULL DEFAULT 0 CHECK (contract_target_count >= 0),
      comment TEXT,
      deadline_date TEXT,
      focal_point TEXT,
      roadmap_sheet_number TEXT,
      default_duration_months INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      created_by TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS dossiers_workspace_name_unique_idx
      ON dossiers (workspace_id, name COLLATE NOCASE)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS dossiers_workspace_idx
      ON dossiers (workspace_id);

    CREATE TABLE IF NOT EXISTS contrat (
      id_contrat TEXT PRIMARY KEY,
      nif TEXT NOT NULL,
      duree_contrat INTEGER NOT NULL DEFAULT 12,
      salaire TEXT NOT NULL,
      annee_fiscale TEXT NOT NULL,
      salaire_en_chiffre REAL NOT NULL,
      titre TEXT NOT NULL,
      lieu_affectation TEXT NOT NULL,
      historique_saisie TEXT NOT NULL,
      commentaire TEXT,
      created_by TEXT,
      workspace_id TEXT NOT NULL,
      dossier_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','final','saisie','correction','impression_partiel','imprime','signe','transfere','classe')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (nif) REFERENCES identification(nif) ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS contrat_workspace_idx
      ON contrat (workspace_id);

    CREATE INDEX IF NOT EXISTS contrat_nif_idx
      ON contrat (workspace_id, nif);

    CREATE INDEX IF NOT EXISTS contrat_dossier_idx
      ON contrat (workspace_id, dossier_id);

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      created_by TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS tags_workspace_name_unique_idx
      ON tags (workspace_id, name COLLATE NOCASE)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS tags_workspace_idx
      ON tags (workspace_id);

    CREATE TABLE IF NOT EXISTS contract_tags (
      contract_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (contract_id, tag_id),
      FOREIGN KEY (contract_id) REFERENCES contrat(id_contrat) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS contract_tags_contract_id_idx
      ON contract_tags (contract_id);

    CREATE INDEX IF NOT EXISTS contract_tags_tag_id_idx
      ON contract_tags (tag_id);

    CREATE TABLE IF NOT EXISTS contract_print_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      contract_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      printed_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS autocompletion (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('address','position','institution')),
      label TEXT NOT NULL,
      salaries TEXT,
      address_keywords TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS autocompletion_workspace_type_idx
      ON autocompletion (workspace_id, type);
  `);

  const ensureColumns = (table: string, columns: Array<{ name: string; sql: string }>) => {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    for (const column of columns) {
      if (!info.some((item) => item.name === column.name)) {
        db.exec(column.sql);
      }
    }
  };

  ensureColumns("autocompletion", [
    {
      name: "salaries",
      sql: "ALTER TABLE autocompletion ADD COLUMN salaries TEXT;"
    }
  ]);
  ensureColumns("dossiers", [
    {
      name: "status",
      sql: "ALTER TABLE dossiers ADD COLUMN status TEXT NOT NULL DEFAULT 'active';"
    },
    {
      name: "default_duration_months",
      sql: "ALTER TABLE dossiers ADD COLUMN default_duration_months INTEGER;"
    },
    {
      name: "created_by",
      sql: "ALTER TABLE dossiers ADD COLUMN created_by TEXT;"
    }
  ]);
  ensureColumns("contrat", [
    {
      name: "commentaire",
      sql: "ALTER TABLE contrat ADD COLUMN commentaire TEXT;"
    },
    {
      name: "created_by",
      sql: "ALTER TABLE contrat ADD COLUMN created_by TEXT;"
    }
  ]);

  const now = nowIso();
  const upsertWorkspace = db.prepare(`
    INSERT INTO workspaces (id, name, created_at, updated_at)
    VALUES (:id, :name, :created_at, :updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at
  `);

  for (const workspace of WORKSPACES) {
    upsertWorkspace.run({
      id: workspace.id,
      name: workspace.name,
      created_at: now,
      updated_at: now
    });
  }

  const existingAutoCount = db.prepare("SELECT count(*) as c FROM autocompletion WHERE workspace_id = 'workspace_default'").get() as { c: number };
  if (existingAutoCount.c === 0) {
    const addresses = [
        "Port-au-Prince", "Delmas", "Pétion-Ville", "Tabarre", "Croix-des-Bouquets",
        "Carrefour", "Kenscoff", "Gressier", "Léogâne", "Jacmel", "Les Cayes",
        "Cap-Haïtien", "Gonaïves", "Saint-Marc", "Jérémie", "Hinche"
    ];
    const positions = [
        { l: "Agent de Liaison", s: 25000 },
        { l: "Intendant", s: 35000 },
        { l: "Auxiliaire-Infirmière", s: 30000 },
        { l: "Infirmière de Ligne", s: 45000 },
        { l: "Aide-Infirmière", s: 25000 },
        { l: "Médecin", s: 75000 },
        { l: "Technicien de Laboratoire", s: 40000 },
        { l: "Pharmacien", s: 60000 },
        { l: "Sage-Femme", s: 45000 },
        { l: "Assistante Administrative", s: 30000 },
        { l: "Agent de Sécurité", s: 20000 },
        { l: "Chauffeur", s: 25000 },
        { l: "Ménagère", s: 18000 },
        { l: "Cuisinier(ère)", s: 20000 }
    ];
    const institutions = [
        { l: "Hôpital de l'Université d'État d'Haïti (HUEH)", k: ["port-au-prince"] },
        { l: "Sanatorium", k: ["port-au-prince"] },
        { l: "Centre de Santé de Delmas 33", k: ["delmas"] },
        { l: "Centre de Santé de Delmas 75", k: ["delmas"] },
        { l: "Hôpital de la Communauté Haïtienne", k: ["pétion-ville", "petion-ville"] },
        { l: "Centre de Santé de Tabarre", k: ["tabarre"] },
        { l: "Hôpital Universitaire de la Paix", k: ["delmas"] },
        { l: "Centre de Santé de Croix-des-Bouquets", k: ["croix-des-bouquets"] },
        { l: "Hôpital Sainte-Catherine Labouré", k: ["carrefour"] },
        { l: "Centre Hospitalier de Kenscoff", k: ["kenscoff"] },
        { l: "Hôpital Immaculée Conception (Les Cayes)", k: ["les cayes", "cayes"] },
        { l: "Hôpital Justinien (Cap-Haïtien)", k: ["cap-haïtien", "cap-haitien", "cap haïtien"] },
        { l: "Hôpital La Providence (Gonaïves)", k: ["gonaïves", "gonaives"] },
        { l: "Maternité Isaïe Jeanty", k: ["port-au-prince"] },
        { l: "Direction Générale", k: [] },
        { l: "Direction Départementale", k: [] }
    ];

    const insertAuto = db.prepare(`
        INSERT INTO autocompletion (id, type, label, salaries, address_keywords, order_index, workspace_id, created_at, updated_at)
        VALUES (:id, :type, :label, :salaries, :address_keywords, :order_index, :workspace_id, :created_at, :updated_at)
    `);

    addresses.forEach((label, idx) => {
        insertAuto.run({
            id: randomUUID(), type: "address", label, salaries: null, address_keywords: null,
            order_index: idx, workspace_id: "workspace_default", created_at: now, updated_at: now
        });
    });
    positions.forEach((p, idx) => {
        insertAuto.run({
            id: randomUUID(), type: "position", label: p.l, salaries: JSON.stringify([p.s]), address_keywords: null,
            order_index: idx, workspace_id: "workspace_default", created_at: now, updated_at: now
        });
    });
    institutions.forEach((i, idx) => {
        insertAuto.run({
            id: randomUUID(), type: "institution", label: i.l, salaries: null, address_keywords: JSON.stringify(i.k),
            order_index: idx, workspace_id: "workspace_default", created_at: now, updated_at: now
        });
    });
  }

  cachedDb = db;
  return db;
}

function buildSqlBackupDump(db: DatabaseSync): string {
  const lines: string[] = [];
  const generatedAt = nowIso();

  lines.push("-- Contribution SQLite backup");
  lines.push(`-- Generated at ${generatedAt}`);
  lines.push("PRAGMA foreign_keys=OFF;");
  lines.push("BEGIN TRANSACTION;");

  const schemaRows = db
    .prepare(`
      SELECT type, name, sql
      FROM sqlite_master
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
      ORDER BY
        CASE type
          WHEN 'table' THEN 0
          WHEN 'index' THEN 1
          WHEN 'trigger' THEN 2
          WHEN 'view' THEN 3
          ELSE 4
        END,
        name
    `)
    .all() as Array<{
    type: string;
    name: string;
    sql: string;
  }>;

  for (const row of schemaRows) {
    const statement = row.sql.trim();
    if (statement.length) {
      lines.push(`${statement};`);
    }
  }

  const tableRows = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all() as RawRecord[];

  for (const tableRow of tableRows) {
    const tableName = asString(tableRow.name);
    if (!tableName) {
      continue;
    }

    const tableInfo = db
      .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
      .all() as RawRecord[];
    const columns = tableInfo
      .map((column) => asString(column.name))
      .filter((column) => column.length > 0);

    if (columns.length === 0) {
      continue;
    }

    const selectSql = `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(tableName)}`;
    const rows = db.prepare(selectSql).all() as RawRecord[];

    for (const row of rows) {
      const values = columns.map((columnName) => toSqlLiteral(row[columnName]));
      lines.push(
        `INSERT INTO ${quoteIdentifier(tableName)} (${columns
          .map(quoteIdentifier)
          .join(", ")}) VALUES (${values.join(", ")});`
      );
    }
  }

  lines.push("COMMIT;");
  lines.push("PRAGMA foreign_keys=ON;");
  lines.push("");

  return lines.join("\n");
}

function buildContractRows(workspaceId: string): ContractRow[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT
        c.id_contrat,
        c.workspace_id,
        c.dossier_id,
        c.nif,
        c.status,
        c.duree_contrat,
        c.salaire_en_chiffre,
        c.salaire,
        c.titre,
        c.lieu_affectation,
        c.annee_fiscale,
        c.created_at,
        c.updated_at,
        c.deleted_at,
        c.historique_saisie,
        c.commentaire,
        c.created_by,
        i.nom,
        i.prenom,
        i.sexe,
        i.ninu,
        i.adresse
      FROM contrat c
      INNER JOIN identification i ON i.nif = c.nif
      WHERE c.workspace_id = :workspace_id
        AND c.deleted_at IS NULL
    `)
    .all({ workspace_id: workspaceId }) as ContractRow[];

  return rows;
}

function buildContractId(db: DatabaseSync, date = new Date()): { id: string; fiscalYearLabel: string } {
  const fiscal = fiscalYearFor(date);

  const existsStatement = db.prepare("SELECT id_contrat FROM contrat WHERE id_contrat = :id LIMIT 1");
  for (let index = 0; index < 200; index += 1) {
    const suffix = String(randomInt(0, 10000)).padStart(4, "0");
    const candidate = `${fiscal.code}${suffix}`;
    const existing = existsStatement.get({ id: candidate }) as RawRecord | undefined;
    if (!existing) {
      return { id: candidate, fiscalYearLabel: fiscal.label };
    }
  }

  throw new HttpError(500, "Impossible de générer un ID_Contrat unique.");
}

function operatorFromRequest(req: IncomingMessage): AuditActor {
  const raw = req.headers["x-operator-name"];
  let name = "Administrateur";
  if (typeof raw === "string" && raw.trim()) {
    name = raw.trim();
  } else if (Array.isArray(raw)) {
    const first = raw.find((item) => item.trim());
    if (first) {
      name = first.trim();
    }
  }
  const idHeader = req.headers["x-operator-id"];
  const roleHeader = req.headers["x-operator-role"];
  return {
    id: typeof idHeader === "string" ? idHeader : null,
    name,
    role: typeof roleHeader === "string" ? roleHeader : null
  };
}

async function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  const db = getDb();
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === `${API_PREFIX}/health` && method === "GET") {
    sendJson(res, 200, { ok: true, provider: "sqlite", path: getDbFilePath() });
    return;
  }

  if (pathname === `${API_PREFIX}/backup/sql` && method === "GET") {
    const dump = buildSqlBackupDump(db);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `contribution-backup-${timestamp}.sql`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(dump);
    return;
  }

  if (pathname === `${API_PREFIX}/workspaces` && method === "GET") {
    const rows = db
      .prepare(`
        SELECT id, name, created_at, updated_at, deleted_at
        FROM workspaces
        WHERE deleted_at IS NULL
        ORDER BY created_at ASC
      `)
      .all() as RawRecord[];

    sendJson(res, 200, rows.map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
      deletedAt: asNullableString(row.deleted_at)
    })));
    return;
  }

  if (pathname === `${API_PREFIX}/tags` && method === "GET") {
    const workspaceId = url.searchParams.get("workspaceId")?.trim() || "";
    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    const rows = db
      .prepare(`
        SELECT *
        FROM tags
        WHERE workspace_id = :workspace_id
          AND deleted_at IS NULL
        ORDER BY name COLLATE NOCASE ASC
      `)
      .all({ workspace_id: workspaceId }) as TagRow[];

    sendJson(res, 200, rows.map(mapTag));
    return;
  }

  if (pathname === `${API_PREFIX}/tags` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const name = normalizeTagName(asString(body.name));
    const color = asString(body.color).trim() || tagColor(name);

    if (!workspaceId || !name) {
      throw new HttpError(400, "workspaceId et nom du tag sont obligatoires.");
    }

    const existing = db
      .prepare(`
        SELECT *
        FROM tags
        WHERE workspace_id = :workspace_id
          AND name = :name COLLATE NOCASE
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ workspace_id: workspaceId, name }) as TagRow | undefined;
    if (existing) {
      sendJson(res, 200, mapTag(existing));
      return;
    }

    const timestamp = nowIso();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO tags (
        id,
        workspace_id,
        name,
        color,
        created_at,
        updated_at,
        deleted_at,
        created_by
      ) VALUES (
        :id,
        :workspace_id,
        :name,
        :color,
        :created_at,
        :updated_at,
        NULL,
        :created_by
      )
    `).run({
      id,
      workspace_id: workspaceId,
      name,
      color,
      created_at: timestamp,
      updated_at: timestamp,
      created_by: asNullableString(body.createdBy)
    });

    const row = db.prepare("SELECT * FROM tags WHERE id = :id").get({ id }) as TagRow;
    sendJson(res, 200, mapTag(row));
    return;
  }

  if (pathname === `${API_PREFIX}/tags/assign` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const contractId = asString(body.contractId);
    const tagId = asString(body.tagId);
    if (!workspaceId || !contractId || !tagId) {
      throw new HttpError(400, "workspaceId, contractId et tagId sont obligatoires.");
    }

    const contract = db
      .prepare(`
        SELECT id_contrat
        FROM contrat
        WHERE id_contrat = :contract_id
          AND workspace_id = :workspace_id
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ contract_id: contractId, workspace_id: workspaceId }) as RawRecord | undefined;
    const tag = db
      .prepare(`
        SELECT id
        FROM tags
        WHERE id = :tag_id
          AND workspace_id = :workspace_id
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ tag_id: tagId, workspace_id: workspaceId }) as RawRecord | undefined;
    if (!contract || !tag) {
      throw new HttpError(404, "Contrat ou tag introuvable.");
    }

    db.prepare(`
      INSERT OR IGNORE INTO contract_tags (contract_id, tag_id, created_at)
      VALUES (:contract_id, :tag_id, :created_at)
    `).run({
      contract_id: contractId,
      tag_id: tagId,
      created_at: nowIso()
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === `${API_PREFIX}/tags/remove` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const contractId = asString(body.contractId);
    const tagId = asString(body.tagId);
    if (!workspaceId || !contractId || !tagId) {
      throw new HttpError(400, "workspaceId, contractId et tagId sont obligatoires.");
    }

    db.prepare(`
      DELETE FROM contract_tags
      WHERE contract_id = :contract_id
        AND tag_id = :tag_id
        AND EXISTS (
          SELECT 1
          FROM contrat c
          WHERE c.id_contrat = contract_tags.contract_id
            AND c.workspace_id = :workspace_id
        )
    `).run({
      contract_id: contractId,
      tag_id: tagId,
      workspace_id: workspaceId
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === `${API_PREFIX}/applicants` && method === "GET") {
    const workspaceId = asString(url.searchParams.get("workspaceId"));
    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }
    const rows = db
      .prepare(`
        SELECT *
        FROM identification
        WHERE workspace_id = :workspace_id
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `)
      .all({ workspace_id: workspaceId }) as RawRecord[];
    sendJson(res, 200, rows.map(mapApplicant));
    return;
  }

  if (pathname === `${API_PREFIX}/applicants/upsert` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId) || "workspace_default";
    const existingId = asNullableString(body.id);
    const nif = asNullableString(body.nif);
    const ninu = asNullableString(body.ninu);
    const gender = asString(body.gender) as "Homme" | "Femme";
    const firstName = asString(body.firstName).trim();
    const lastName = asString(body.lastName).trim();
    const address = asString(body.address).trim();

    if (!nif) {
      throw new HttpError(400, "Le NIF est obligatoire pour la table identification.");
    }
    if (!gender || (gender !== "Homme" && gender !== "Femme")) {
      throw new HttpError(400, "Le sexe est invalide.");
    }
    if (!firstName || !lastName || !address) {
      throw new HttpError(400, "Nom, prénom et adresse sont obligatoires.");
    }

    const timestamp = nowIso();
    const byNif = db
      .prepare(`
        SELECT *
        FROM identification
        WHERE nif = :nif
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ nif }) as RawRecord | undefined;

    const byNinu = ninu
      ? ((db
          .prepare(`
            SELECT *
            FROM identification
            WHERE ninu = :ninu
              AND deleted_at IS NULL
            LIMIT 1
          `)
          .get({ ninu }) as RawRecord | undefined) ?? undefined)
      : undefined;

    if (byNif && byNinu && asString(byNif.nif) !== asString(byNinu.nif)) {
      throw new HttpError(
        400,
        "Conflit: ce NIF et ce NINU appartiennent à deux enregistrements différents."
      );
    }

    const byExistingId = existingId
      ? (db
          .prepare(`
            SELECT *
            FROM identification
            WHERE nif = :nif
              AND deleted_at IS NULL
            LIMIT 1
          `)
          .get({ nif: existingId }) as RawRecord | undefined)
      : undefined;
    const target = byExistingId ?? byNif ?? byNinu;

    if (target) {
      const previousNif = asString(target.nif);
      if (previousNif !== nif) {
        const nifOwner = db
          .prepare(`
            SELECT nif
            FROM identification
            WHERE nif = :nif
              AND deleted_at IS NULL
            LIMIT 1
          `)
          .get({ nif }) as RawRecord | undefined;
        if (nifOwner && asString(nifOwner.nif) !== previousNif) {
          throw new HttpError(400, "Ce NIF existe déjà.");
        }
      }

      db.prepare(`
        UPDATE identification
        SET nif = :new_nif,
            nom = :nom,
            prenom = :prenom,
            sexe = :sexe,
            ninu = :ninu,
            adresse = :adresse,
            workspace_id = :workspace_id,
            updated_at = :updated_at,
            deleted_at = NULL
        WHERE nif = :old_nif
      `).run({
        new_nif: nif,
        nom: lastName,
        prenom: firstName,
        sexe: gender,
        ninu,
        adresse: address,
        workspace_id: workspaceId,
        updated_at: timestamp,
        old_nif: previousNif
      });
    } else {
      db.prepare(`
        INSERT INTO identification (
          nif,
          nom,
          prenom,
          sexe,
          ninu,
          adresse,
          workspace_id,
          created_at,
          updated_at
        ) VALUES (
          :nif,
          :nom,
          :prenom,
          :sexe,
          :ninu,
          :adresse,
          :workspace_id,
          :created_at,
          :updated_at
        )
      `).run({
        nif,
        nom: lastName,
        prenom: firstName,
        sexe: gender,
        ninu,
        adresse: address,
        workspace_id: workspaceId,
        created_at: timestamp,
        updated_at: timestamp
      });
    }

    const saved = db
      .prepare("SELECT * FROM identification WHERE nif = :nif LIMIT 1")
      .get({ nif }) as RawRecord;

    sendJson(res, 200, mapApplicant(saved));
    return;
  }

  if (pathname === `${API_PREFIX}/applicants/soft-delete` && method === "POST") {
    const body = await parseBody(req);
    const id = asString(body.id);
    const workspaceId = asString(body.workspaceId);
    if (!id || !workspaceId) {
      throw new HttpError(400, "id et workspaceId sont obligatoires.");
    }
    db.prepare(`
      UPDATE identification
      SET deleted_at = :deleted_at,
          updated_at = :updated_at
      WHERE nif = :nif
        AND workspace_id = :workspace_id
    `).run({
      deleted_at: nowIso(),
      updated_at: nowIso(),
      nif: id,
      workspace_id: workspaceId
    });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === `${API_PREFIX}/applicants/find` && method === "GET") {
    const workspaceId = asString(url.searchParams.get("workspaceId"));
    const nif = asNullableString(url.searchParams.get("nif"));
    const ninu = asNullableString(url.searchParams.get("ninu"));

    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    if (!nif && !ninu) {
      sendJson(res, 200, null);
      return;
    }

    const row = db
      .prepare(`
        SELECT *
        FROM identification
        WHERE workspace_id = :workspace_id
          AND deleted_at IS NULL
          AND (
            (:nif IS NOT NULL AND nif = :nif)
            OR (:ninu IS NOT NULL AND ninu = :ninu)
          )
        LIMIT 1
      `)
      .get({ workspace_id: workspaceId, nif, ninu }) as RawRecord | undefined;

    sendJson(res, 200, row ? mapApplicant(row) : null);
    return;
  }

  const applicantByIdMatch = pathname.match(/^\/api\/local\/applicants\/([^/]+)$/);
  if (applicantByIdMatch && method === "GET") {
    const nif = decodeURIComponent(applicantByIdMatch[1]);
    const row = db
      .prepare(`
        SELECT *
        FROM identification
        WHERE nif = :nif
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ nif }) as RawRecord | undefined;

    sendJson(res, 200, row ? mapApplicant(row) : null);
    return;
  }

  if (pathname === `${API_PREFIX}/dossiers` && method === "GET") {
    const workspaceId = asString(url.searchParams.get("workspaceId"));
    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    const rows = db
      .prepare(`
        SELECT *
        FROM dossiers
        WHERE workspace_id = :workspace_id
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `)
      .all({ workspace_id: workspaceId }) as RawRecord[];

    sendJson(res, 200, rows.map(mapDossier));
    return;
  }

  if (pathname === `${API_PREFIX}/dossiers` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId) || "workspace_default";
    const name = asString(body.name).trim();
    if (!name) {
      throw new HttpError(400, "Le nom du dossier est obligatoire.");
    }

    const existing = db
      .prepare(`
        SELECT *
        FROM dossiers
        WHERE workspace_id = :workspace_id
          AND deleted_at IS NULL
          AND lower(name) = lower(:name)
        LIMIT 1
      `)
      .get({ workspace_id: workspaceId, name }) as RawRecord | undefined;

    if (existing) {
      sendJson(res, 200, mapDossier(existing));
      return;
    }

    const timestamp = nowIso();
    const id = asString(body.id) || randomUUID();

    db.prepare(`
      INSERT INTO dossiers (
        id,
        workspace_id,
        id_contrat,
        name,
        status,
        is_ephemeral,
        priority,
        contract_target_count,
        comment,
        deadline_date,
        focal_point,
        roadmap_sheet_number,
        default_duration_months,
        created_at,
        updated_at,
        created_by
      ) VALUES (
        :id,
        :workspace_id,
        NULL,
        :name,
        :status,
        :is_ephemeral,
        :priority,
        :contract_target_count,
        :comment,
        :deadline_date,
        :focal_point,
        :roadmap_sheet_number,
        :default_duration_months,
        :created_at,
        :updated_at,
        :created_by
      )
    `).run({
      id,
      workspace_id: workspaceId,
      name,
      status: asString(body.status) === "classified" ? "classified" : "active",
      is_ephemeral: body.isEphemeral ? 1 : 0,
      priority: asString(body.priority) === "urgence" ? "urgence" : "normal",
      contract_target_count: Math.max(0, asInteger(body.contractTargetCount, 0)),
      comment: asNullableString(body.comment),
      deadline_date: asNullableString(body.deadlineDate),
      focal_point: asNullableString(body.focalPoint),
      roadmap_sheet_number: asNullableString(body.roadmapSheetNumber),
      default_duration_months:
        body.defaultDurationMonths === null || body.defaultDurationMonths === undefined
          ? null
          : Math.max(1, asInteger(body.defaultDurationMonths, 0)) || null,
      created_at: timestamp,
      updated_at: timestamp,
      created_by: asNullableString(body.createdBy)
    });

    const created = db
      .prepare("SELECT * FROM dossiers WHERE id = :id LIMIT 1")
      .get({ id }) as RawRecord;

    sendJson(res, 200, mapDossier(created));
    return;
  }

  if (pathname === `${API_PREFIX}/dossiers/delete` && method === "POST") {
    const body = await parseBody(req);
    const id = asString(body.id);
    const workspaceId = asString(body.workspaceId);
    if (!id || !workspaceId) {
      throw new HttpError(400, "id et workspaceId sont obligatoires.");
    }

    const timestamp = nowIso();

    const dossierDeletion = db
      .prepare(`
        UPDATE dossiers
        SET deleted_at = :timestamp,
            updated_at = :timestamp
        WHERE id = :id
          AND workspace_id = :workspace_id
          AND deleted_at IS NULL
      `)
      .run({
        timestamp,
        id,
        workspace_id: workspaceId
      });

    if ((dossierDeletion.changes ?? 0) === 0) {
      sendJson(res, 200, 0);
      return;
    }

    const unassigned = db
      .prepare(`
        UPDATE contrat
        SET dossier_id = NULL,
            updated_at = :timestamp
        WHERE workspace_id = :workspace_id
          AND deleted_at IS NULL
          AND dossier_id = :dossier_id
      `)
      .run({
        timestamp,
        workspace_id: workspaceId,
        dossier_id: id
      });

    sendJson(res, 200, unassigned.changes ?? 0);
    return;
  }

  const dossierByIdMatch = pathname.match(/^\/api\/local\/dossiers\/([^/]+)$/);
  if (dossierByIdMatch && method === "GET") {
    const id = decodeURIComponent(dossierByIdMatch[1]);
    const row = db
      .prepare(`
        SELECT *
        FROM dossiers
        WHERE id = :id
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ id }) as RawRecord | undefined;

    sendJson(res, 200, row ? mapDossier(row) : null);
    return;
  }

  if (dossierByIdMatch && method === "PATCH") {
    const id = decodeURIComponent(dossierByIdMatch[1]);
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);

    const current = db
      .prepare(`
        SELECT *
        FROM dossiers
        WHERE id = :id
          AND workspace_id = :workspace_id
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ id, workspace_id: workspaceId }) as RawRecord | undefined;

    if (!current) {
      throw new HttpError(404, "Dossier introuvable.");
    }

    const nextNameRaw = asNullableString(body.name);
    const nextName = nextNameRaw ?? asString(current.name);
    if (!nextName) {
      throw new HttpError(400, "Le nom du dossier est obligatoire.");
    }

    const duplicate = db
      .prepare(`
        SELECT id
        FROM dossiers
        WHERE workspace_id = :workspace_id
          AND id <> :id
          AND deleted_at IS NULL
          AND lower(name) = lower(:name)
        LIMIT 1
      `)
      .get({
        workspace_id: workspaceId,
        id,
        name: nextName
      }) as RawRecord | undefined;

    if (duplicate) {
      throw new HttpError(400, "Un dossier avec ce nom existe déjà.");
    }

    const timestamp = nowIso();
    db.prepare(`
      UPDATE dossiers
      SET name = :name,
          status = :status,
          is_ephemeral = :is_ephemeral,
          priority = :priority,
          contract_target_count = :contract_target_count,
          comment = :comment,
          deadline_date = :deadline_date,
          focal_point = :focal_point,
          roadmap_sheet_number = :roadmap_sheet_number,
          default_duration_months = :default_duration_months,
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      name: nextName,
      status:
        body.status !== undefined
          ? asString(body.status) === "classified"
            ? "classified"
            : "active"
          : asString(current.status) === "classified"
            ? "classified"
            : "active",
      is_ephemeral:
        body.isEphemeral !== undefined
          ? (body.isEphemeral ? 1 : 0)
          : Number(current.is_ephemeral) === 1
            ? 1
            : 0,
      priority:
        body.priority !== undefined
          ? asString(body.priority) === "urgence"
            ? "urgence"
            : "normal"
          : asString(current.priority) === "urgence"
            ? "urgence"
            : "normal",
      contract_target_count:
        body.contractTargetCount !== undefined
          ? Math.max(0, asInteger(body.contractTargetCount, 0))
          : Math.max(0, asInteger(current.contract_target_count, 0)),
      comment:
        body.comment !== undefined
          ? asNullableString(body.comment)
          : asNullableString(current.comment),
      deadline_date:
        body.deadlineDate !== undefined
          ? asNullableString(body.deadlineDate)
          : asNullableString(current.deadline_date),
      focal_point:
        body.focalPoint !== undefined
          ? asNullableString(body.focalPoint)
          : asNullableString(current.focal_point),
      roadmap_sheet_number:
        body.roadmapSheetNumber !== undefined
          ? asNullableString(body.roadmapSheetNumber)
          : asNullableString(current.roadmap_sheet_number),
      default_duration_months:
        body.defaultDurationMonths !== undefined
          ? body.defaultDurationMonths === null
            ? null
            : Math.max(1, asInteger(body.defaultDurationMonths, 0)) || null
          : asInteger(current.default_duration_months, 0) || null,
      updated_at: timestamp
    });

    const updated = db
      .prepare("SELECT * FROM dossiers WHERE id = :id LIMIT 1")
      .get({ id }) as RawRecord;

    sendJson(res, 200, mapDossier(updated));
    return;
  }

  if (pathname === `${API_PREFIX}/contracts/list` && method === "POST") {
    const body = await parseBody(req);
    const payload = body as ContractListPayload;
    const workspaceId = asString(payload.workspaceId);

    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    const page = Math.max(1, asInteger(payload.page, 1));
    const pageSize = Math.max(1, asInteger(payload.pageSize, 10));

    let items = buildContractRows(workspaceId).map(mapContract);

    if (payload.query?.trim()) {
      const q = payload.query.trim();
      items = items.filter((item) => contractMatchesQuery(item, q));
    }

    if (payload.status) {
      items = items.filter((item) => item.status === payload.status);
    }

    if (payload.dossierId !== undefined) {
      const targetDossier = payload.dossierId ?? null;
      items = items.filter((item) => (item.dossierId ?? null) === targetDossier);
    }

    if (payload.tagId) {
      items = items.filter((item) => item.tags.some((tag) => tag.id === payload.tagId));
    }

    if (payload.assignments && payload.assignments.length > 0) {
      items = items.filter((item) => payload.assignments!.includes(item.assignment));
    }

    if (payload.positions && payload.positions.length > 0) {
      items = items.filter((item) => payload.positions!.includes(item.position));
    }

    if (payload.dateFilterMode && payload.dateFilterMode !== "all") {
      items = items.filter((contract) =>
        matchesContractDateFilter(
          {
            createdAt: contract.createdAt,
            updatedAt: contract.updatedAt,
            durationMonths: contract.durationMonths
          },
          payload.dateFilterMode,
          {
            dayDateInput: payload.dateFilterDate,
            rangeStartInput: payload.dateFilterStart,
            rangeEndInput: payload.dateFilterEnd
          }
        )
      );
    }

    const total = items.length;
    items = sortContracts(items, payload.sort);
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    sendJson(res, 200, {
      items: paged,
      total,
      page,
      pageSize
    });
    return;
  }

  if (pathname === `${API_PREFIX}/contracts/by-ids` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const ids = Array.isArray(body.ids) ? body.ids.map((item) => asString(item)).filter(Boolean) : [];

    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    if (ids.length === 0) {
      sendJson(res, 200, []);
      return;
    }

    const idSet = new Set(ids);
    const items = buildContractRows(workspaceId)
      .map(mapContract)
      .filter((item) => idSet.has(item.id));

    sendJson(res, 200, items);
    return;
  }

  if (pathname === `${API_PREFIX}/contracts` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId) || "workspace_default";
    const nif = asNullableString(body.nif);

    if (!nif) {
      throw new HttpError(400, "Le NIF est obligatoire pour créer un contrat.");
    }

    const identification = db
      .prepare(`
        SELECT *
        FROM identification
        WHERE nif = :nif
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ nif }) as RawRecord | undefined;

    if (!identification) {
      throw new HttpError(400, "Aucune fiche identification trouvée pour ce NIF.");
    }

    const durationMonths = Math.max(1, Math.min(24, asInteger(body.durationMonths, 12)));
    const salaryNumber = asNumber(body.salaryNumber, 0);
    const salaryText = asString(body.salaryText).trim();
    const position = asString(body.position).trim();
    const assignment = asString(body.assignment).trim();
    const status = asString(body.status).trim() || "saisie";

    if (!salaryText || !position || !assignment) {
      throw new HttpError(400, "Titre, lieu d'affectation et salaire texte sont obligatoires.");
    }

    if (!ALLOWED_STATUSES.has(status)) {
      throw new HttpError(400, "Statut de contrat invalide.");
    }

    const timestamp = nowIso();
    const { id, fiscalYearLabel } = buildContractId(db);
    const operator = operatorFromRequest(req);

    const history: HistoryPayload = {
      version: 2,
      createdAt: timestamp,
      createdBy: operator,
      entries: []
    };

    db.prepare(`
      INSERT INTO contrat (
        id_contrat,
        nif,
        duree_contrat,
        salaire,
        annee_fiscale,
        salaire_en_chiffre,
        titre,
        lieu_affectation,
        historique_saisie,
        commentaire,
        created_by,
        workspace_id,
        dossier_id,
        status,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        :id_contrat,
        :nif,
        :duree_contrat,
        :salaire,
        :annee_fiscale,
        :salaire_en_chiffre,
        :titre,
        :lieu_affectation,
        :historique_saisie,
        :commentaire,
        :created_by,
        :workspace_id,
        :dossier_id,
        :status,
        :created_at,
        :updated_at,
        NULL
      )
    `).run({
      id_contrat: id,
      nif,
      duree_contrat: durationMonths,
      salaire: salaryText,
      annee_fiscale: fiscalYearLabel,
      salaire_en_chiffre: salaryNumber,
      titre: position,
      lieu_affectation: assignment,
      historique_saisie: JSON.stringify(history),
      commentaire: asNullableString(body.commentaire),
      created_by: asNullableString(body.createdBy) ?? operator.id ?? null,
      workspace_id: workspaceId,
      dossier_id: asNullableString(body.dossierId),
      status,
      created_at: timestamp,
      updated_at: timestamp
    });

    const createdRow = db
      .prepare(`
        SELECT
          c.id_contrat,
          c.workspace_id,
          c.dossier_id,
          c.nif,
          c.status,
          c.duree_contrat,
          c.salaire_en_chiffre,
          c.salaire,
          c.titre,
          c.lieu_affectation,
          c.annee_fiscale,
          c.created_at,
          c.updated_at,
          c.deleted_at,
          c.historique_saisie,
          c.commentaire,
          c.created_by,
          i.nom,
          i.prenom,
          i.sexe,
          i.ninu,
          i.adresse
        FROM contrat c
        INNER JOIN identification i ON i.nif = c.nif
        WHERE c.id_contrat = :id
        LIMIT 1
      `)
      .get({ id }) as ContractRow;

    sendJson(res, 200, mapContract(createdRow));
    return;
  }

  if (pathname === `${API_PREFIX}/contracts/assign-dossier` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const contractIds = Array.isArray(body.contractIds)
      ? body.contractIds.map((item) => asString(item)).filter(Boolean)
      : [];

    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    if (contractIds.length === 0) {
      sendJson(res, 200, 0);
      return;
    }

    const timestamp = nowIso();
    const dossierId = asNullableString(body.dossierId);
    const operator = operatorFromRequest(req);
    const statement = db.prepare(`
      UPDATE contrat
      SET dossier_id = :dossier_id,
          historique_saisie = :historique_saisie,
          updated_at = :updated_at
      WHERE id_contrat = :id_contrat
        AND workspace_id = :workspace_id
        AND deleted_at IS NULL
    `);

    let updatedCount = 0;
    for (const contractId of contractIds) {
      const current = db.prepare(`
        SELECT dossier_id, historique_saisie
        FROM contrat
        WHERE id_contrat = :id_contrat
          AND workspace_id = :workspace_id
          AND deleted_at IS NULL
      `).get({
        id_contrat: contractId,
        workspace_id: workspaceId
      }) as RawRecord | undefined;
      if (!current) continue;
      const previousDossierId = asNullableString(current.dossier_id);
      if (previousDossierId === dossierId) continue;
      const history = parseHistory(asNullableString(current.historique_saisie));
      appendHistoryEntry(history, operator, "dossier", [{
        field: "dossierId",
        previousValue: previousDossierId,
        newValue: dossierId
      }], timestamp);
      const result = statement.run({
        dossier_id: dossierId,
        historique_saisie: JSON.stringify(history),
        updated_at: timestamp,
        id_contrat: contractId,
        workspace_id: workspaceId
      });
      updatedCount += Number(result.changes ?? 0);
    }

    sendJson(res, 200, updatedCount);
    return;
  }

  if (pathname === `${API_PREFIX}/contracts/update-status` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const contractIds = Array.isArray(body.contractIds)
      ? body.contractIds.map((item) => asString(item)).filter(Boolean)
      : [];
    const status = asString(body.status);

    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    if (contractIds.length === 0) {
      sendJson(res, 200, 0);
      return;
    }

    if (!ALLOWED_STATUSES.has(status)) {
      throw new HttpError(400, "Statut invalide.");
    }

    const timestamp = nowIso();
    const operator = operatorFromRequest(req);
    const statement = db.prepare(`
      UPDATE contrat
      SET status = :status,
          historique_saisie = :historique_saisie,
          updated_at = :updated_at
      WHERE id_contrat = :id_contrat
        AND workspace_id = :workspace_id
        AND deleted_at IS NULL
    `);

    let updatedCount = 0;
    for (const contractId of contractIds) {
      const current = db.prepare(`
        SELECT status, historique_saisie
        FROM contrat
        WHERE id_contrat = :id_contrat
          AND workspace_id = :workspace_id
          AND deleted_at IS NULL
      `).get({
        id_contrat: contractId,
        workspace_id: workspaceId
      }) as RawRecord | undefined;
      if (!current) continue;
      const previousStatus = asString(current.status);
      if (previousStatus === status) continue;
      const history = parseHistory(asNullableString(current.historique_saisie));
      appendHistoryEntry(history, operator, "status", [{
        field: "status",
        previousValue: previousStatus,
        newValue: status
      }], timestamp);
      const result = statement.run({
        status,
        historique_saisie: JSON.stringify(history),
        updated_at: timestamp,
        id_contrat: contractId,
        workspace_id: workspaceId
      });
      updatedCount += Number(result.changes ?? 0);
    }

    sendJson(res, 200, updatedCount);
    return;
  }

  if (pathname === `${API_PREFIX}/contracts/update-duration` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const contractIds = Array.isArray(body.contractIds)
      ? body.contractIds.map((item) => asString(item)).filter(Boolean)
      : [];
    const durationMonths = Math.max(1, Math.min(24, asInteger(body.durationMonths, 12)));

    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    if (contractIds.length === 0) {
      sendJson(res, 200, 0);
      return;
    }

    const timestamp = nowIso();
    const operator = operatorFromRequest(req);
    const statement = db.prepare(`
      UPDATE contrat
      SET duree_contrat = :duree_contrat,
          historique_saisie = :historique_saisie,
          updated_at = :updated_at
      WHERE id_contrat = :id_contrat
        AND workspace_id = :workspace_id
        AND deleted_at IS NULL
    `);

    let updatedCount = 0;
    for (const contractId of contractIds) {
      const current = db.prepare(`
        SELECT duree_contrat, historique_saisie
        FROM contrat
        WHERE id_contrat = :id_contrat
          AND workspace_id = :workspace_id
          AND deleted_at IS NULL
      `).get({
        id_contrat: contractId,
        workspace_id: workspaceId
      }) as RawRecord | undefined;
      if (!current) continue;
      const previousDuration = asInteger(current.duree_contrat, 12);
      if (previousDuration === durationMonths) continue;
      const history = parseHistory(asNullableString(current.historique_saisie));
      appendHistoryEntry(history, operator, "duration", [{
        field: "durationMonths",
        previousValue: previousDuration,
        newValue: durationMonths
      }], timestamp);
      const result = statement.run({
        duree_contrat: durationMonths,
        historique_saisie: JSON.stringify(history),
        updated_at: timestamp,
        id_contrat: contractId,
        workspace_id: workspaceId
      });
      updatedCount += Number(result.changes ?? 0);
    }

    sendJson(res, 200, updatedCount);
    return;
  }

  if (pathname === `${API_PREFIX}/contracts/soft-delete` && method === "POST") {
    const body = await parseBody(req);
    const id = asString(body.id);
    const workspaceId = asString(body.workspaceId);

    if (!id || !workspaceId) {
      throw new HttpError(400, "id et workspaceId sont obligatoires.");
    }

    const timestamp = nowIso();
    const current = db.prepare(`
      SELECT historique_saisie
      FROM contrat
      WHERE id_contrat = :id_contrat
        AND workspace_id = :workspace_id
        AND deleted_at IS NULL
    `).get({
      id_contrat: id,
      workspace_id: workspaceId
    }) as RawRecord | undefined;
    const history = parseHistory(asNullableString(current?.historique_saisie));
    appendHistoryEntry(history, operatorFromRequest(req), "deletion", [], timestamp);
    db.prepare(`
      UPDATE contrat
      SET deleted_at = :deleted_at,
          historique_saisie = :historique_saisie,
          updated_at = :updated_at
      WHERE id_contrat = :id_contrat
        AND workspace_id = :workspace_id
        AND deleted_at IS NULL
    `).run({
      deleted_at: timestamp,
      historique_saisie: JSON.stringify(history),
      updated_at: timestamp,
      id_contrat: id,
      workspace_id: workspaceId
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  const contractByIdMatch = pathname.match(/^\/api\/local\/contracts\/([^/]+)$/);
  if (contractByIdMatch && method === "GET") {
    const id = decodeURIComponent(contractByIdMatch[1]);

    const row = db
      .prepare(`
        SELECT
          c.id_contrat,
          c.workspace_id,
          c.dossier_id,
          c.nif,
          c.status,
          c.duree_contrat,
          c.salaire_en_chiffre,
          c.salaire,
          c.titre,
          c.lieu_affectation,
          c.annee_fiscale,
          c.created_at,
          c.updated_at,
          c.deleted_at,
          c.historique_saisie,
          c.commentaire,
          c.created_by,
          i.nom,
          i.prenom,
          i.sexe,
          i.ninu,
          i.adresse
        FROM contrat c
        INNER JOIN identification i ON i.nif = c.nif
        WHERE c.id_contrat = :id
          AND c.deleted_at IS NULL
        LIMIT 1
      `)
      .get({ id }) as ContractRow | undefined;

    sendJson(res, 200, row ? mapContract(row) : null);
    return;
  }

  if (contractByIdMatch && method === "PATCH") {
    const id = decodeURIComponent(contractByIdMatch[1]);
    const body = await parseBody(req);

    const current = db
      .prepare(`
        SELECT *
        FROM contrat
        WHERE id_contrat = :id
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ id }) as RawRecord | undefined;

    if (!current) {
      throw new HttpError(404, "Contrat introuvable.");
    }

    const nextNif = asNullableString(body.nif) ?? asString(current.nif);
    if (!nextNif) {
      throw new HttpError(400, "Le NIF est obligatoire.");
    }

    const linkedIdentification = db
      .prepare(`
        SELECT nif
        FROM identification
        WHERE nif = :nif
          AND deleted_at IS NULL
        LIMIT 1
      `)
      .get({ nif: nextNif }) as RawRecord | undefined;

    if (!linkedIdentification) {
      throw new HttpError(400, "Aucune fiche identification trouvée pour ce NIF.");
    }

    const nextStatus =
      body.status !== undefined ? asString(body.status) : asString(current.status);
    if (!ALLOWED_STATUSES.has(nextStatus)) {
      throw new HttpError(400, "Statut de contrat invalide.");
    }

    const nextDuration =
      body.durationMonths !== undefined
        ? Math.max(1, Math.min(24, asInteger(body.durationMonths, 12)))
        : Math.max(1, Math.min(24, asInteger(current.duree_contrat, 12)));

    const nextSalaryNumber =
      body.salaryNumber !== undefined
        ? asNumber(body.salaryNumber, 0)
        : asNumber(current.salaire_en_chiffre, 0);

    const nextSalaryText =
      body.salaryText !== undefined
        ? asString(body.salaryText).trim()
        : asString(current.salaire);

    const nextTitle =
      body.position !== undefined
        ? asString(body.position).trim()
        : asString(current.titre);

    const nextAssignment =
      body.assignment !== undefined
        ? asString(body.assignment).trim()
        : asString(current.lieu_affectation);

    if (!nextSalaryText || !nextTitle || !nextAssignment) {
      throw new HttpError(400, "Titre, lieu d'affectation et salaire texte sont obligatoires.");
    }

    const nextDossierId =
      body.dossierId !== undefined
        ? asNullableString(body.dossierId)
        : asNullableString(current.dossier_id);
    const nextComment =
      body.commentaire !== undefined
        ? asNullableString(body.commentaire)
        : asNullableString(current.commentaire);

    const timestamp = nowIso();
    const operator = operatorFromRequest(req);
    const history = parseHistory(asNullableString(current.historique_saisie));

    const changes: AuditChange[] = [];
    const addChange = (field: string, previousValue: AuditValue, newValue: AuditValue) => {
      if (previousValue !== newValue) {
        changes.push({ field, previousValue, newValue });
      }
    };
    addChange("nif", asString(current.nif), nextNif);
    addChange("status", asString(current.status), nextStatus);
    addChange("durationMonths", asInteger(current.duree_contrat, 12), nextDuration);
    addChange("salaryNumber", asNumber(current.salaire_en_chiffre, 0), nextSalaryNumber);
    addChange("salaryText", asString(current.salaire), nextSalaryText);
    addChange("position", asString(current.titre), nextTitle);
    addChange("assignment", asString(current.lieu_affectation), nextAssignment);
    addChange(
      "dossierId",
      asNullableString(current.dossier_id),
      nextDossierId
    );
    addChange(
      "commentaire",
      asNullableString(current.commentaire),
      nextComment
    );
    const action =
      changes.length === 1 && changes[0].field === "status"
        ? "status"
        : changes.length === 1 && changes[0].field === "dossierId"
          ? "dossier"
          : changes.length === 1 && changes[0].field === "durationMonths"
            ? "duration"
            : changes.length === 1 && changes[0].field === "commentaire"
              ? "comment"
              : "modification";
    appendHistoryEntry(history, operator, action, changes, timestamp);

    db.prepare(`
      UPDATE contrat
      SET nif = :nif,
          duree_contrat = :duree_contrat,
          salaire = :salaire,
          salaire_en_chiffre = :salaire_en_chiffre,
          titre = :titre,
          lieu_affectation = :lieu_affectation,
          historique_saisie = :historique_saisie,
          commentaire = :commentaire,
          dossier_id = :dossier_id,
          status = :status,
          updated_at = :updated_at
      WHERE id_contrat = :id_contrat
    `).run({
      id_contrat: id,
      nif: nextNif,
      duree_contrat: nextDuration,
      salaire: nextSalaryText,
      salaire_en_chiffre: nextSalaryNumber,
      titre: nextTitle,
      lieu_affectation: nextAssignment,
      historique_saisie: JSON.stringify(history),
      commentaire: nextComment,
      dossier_id: nextDossierId,
      status: nextStatus,
      updated_at: timestamp
    });

    const updatedRow = db
      .prepare(`
        SELECT
          c.id_contrat,
          c.workspace_id,
          c.dossier_id,
          c.nif,
          c.status,
          c.duree_contrat,
          c.salaire_en_chiffre,
          c.salaire,
          c.titre,
          c.lieu_affectation,
          c.annee_fiscale,
          c.created_at,
          c.updated_at,
          c.deleted_at,
          c.historique_saisie,
          c.commentaire,
          c.created_by,
          i.nom,
          i.prenom,
          i.sexe,
          i.ninu,
          i.adresse
        FROM contrat c
        INNER JOIN identification i ON i.nif = c.nif
        WHERE c.id_contrat = :id
        LIMIT 1
      `)
      .get({ id }) as ContractRow;

    sendJson(res, 200, mapContract(updatedRow));
    return;
  }

  if (pathname === `${API_PREFIX}/print-jobs` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId);
    const contractIds = Array.isArray(body.contractIds)
      ? body.contractIds.map((item) => asString(item)).filter(Boolean)
      : [];

    if (!workspaceId) {
      throw new HttpError(400, "workspaceId est obligatoire.");
    }

    const timestamp = nowIso();
    const id = randomUUID();

    db.prepare(`
      INSERT INTO contract_print_jobs (
        id,
        workspace_id,
        contract_ids_json,
        created_at,
        printed_at
      ) VALUES (
        :id,
        :workspace_id,
        :contract_ids_json,
        :created_at,
        :printed_at
      )
    `).run({
      id,
      workspace_id: workspaceId,
      contract_ids_json: JSON.stringify(contractIds),
      created_at: timestamp,
      printed_at: timestamp
    });

    sendJson(res, 200, {
      id,
      workspaceId,
      contractIds,
      createdAt: timestamp,
      printedAt: timestamp
    });
    return;
  }

  if (pathname === `${API_PREFIX}/autocompletion` && method === "GET") {
    const searchParams = url.searchParams;
    const workspaceId = searchParams.get("workspaceId") || "workspace_default";
    const rows = db.prepare("SELECT * FROM autocompletion WHERE workspace_id = :workspaceId ORDER BY order_index ASC").all({ workspaceId }) as RawRecord[];
    
    const result = {
      addresses: [] as any[],
      positions: [] as any[],
      institutions: [] as any[]
    };

    rows.forEach(row => {
      if (row.type === "address") {
        result.addresses.push({ id: row.id, label: row.label, order: row.order_index });
      } else if (row.type === "position") {
        let salaries: number[] = [];
        try {
          if (row.salaries) {
            salaries = JSON.parse(asString(row.salaries));
          } else if (row.salaries_json) {
            // Backward compatibility during migration
            salaries = JSON.parse(asString(row.salaries_json));
          } else if (row.default_salary) {
            salaries = [asNumber(row.default_salary)];
          }
        } catch {}
        result.positions.push({ 
          id: row.id, 
          label: row.label, 
          salaries,
          order: row.order_index 
        });
      } else if (row.type === "institution") {
        let kw = [];
        try { kw = JSON.parse(asString(row.address_keywords) || "[]"); } catch {}
        result.institutions.push({ id: row.id, label: row.label, addressKeywords: kw, order: row.order_index });
      }
    });

    sendJson(res, 200, result);
    return;
  }

  if (pathname === `${API_PREFIX}/autocompletion/sync` && method === "POST") {
    const body = await parseBody(req);
    const workspaceId = asString(body.workspaceId) || "workspace_default";
    const data = body.data as any;
    if (!data || !workspaceId) throw new HttpError(400, "Données invalides.");

    const now = nowIso();

    db.exec("BEGIN TRANSACTION;");
    try {
      db.prepare("DELETE FROM autocompletion WHERE workspace_id = :workspaceId").run({ workspaceId });
      const insertAuto = db.prepare(`
        INSERT INTO autocompletion (id, type, label, salaries, address_keywords, order_index, workspace_id, created_at, updated_at)
        VALUES (:id, :type, :label, :salaries, :address_keywords, :order_index, :workspace_id, :created_at, :updated_at)
      `);
      
      if (Array.isArray(data.addresses)) {
        data.addresses.forEach((a: any, idx: number) => {
          insertAuto.run({ id: a.id || randomUUID(), type: "address", label: a.label, salaries: null, address_keywords: null, order_index: typeof a.order === 'number' ? a.order : idx, workspace_id: workspaceId, created_at: now, updated_at: now });
        });
      }
      if (Array.isArray(data.positions)) {
        data.positions.forEach((p: any, idx: number) => {
          const salaries = Array.isArray(p.salaries) ? p.salaries : (p.defaultSalary ? [p.defaultSalary] : []);
          insertAuto.run({ 
            id: p.id || randomUUID(), 
            type: "position", 
            label: p.label, 
            salaries: JSON.stringify(salaries),
            address_keywords: null, 
            order_index: typeof p.order === 'number' ? p.order : idx, 
            workspace_id: workspaceId, 
            created_at: now, 
            updated_at: now 
          });
        });
      }
      if (Array.isArray(data.institutions)) {
        data.institutions.forEach((i: any, idx: number) => {
          insertAuto.run({ id: i.id || randomUUID(), type: "institution", label: i.label, salaries: null, address_keywords: JSON.stringify(i.addressKeywords || []), order_index: typeof i.order === 'number' ? i.order : idx, workspace_id: workspaceId, created_at: now, updated_at: now });
        });
      }
      
      db.exec("COMMIT;");
      sendJson(res, 200, { ok: true });
    } catch(err) {
      db.exec("ROLLBACK;");
      throw new HttpError(500, "Erreur de sync autocompletion." + (err as Error).message);
    }
    return;
  }

  if (pathname === `${API_PREFIX}/mspp/verify` && method === "GET") {
    const searchParams = url.searchParams;
    let nifParam = searchParams.get("nif");
    if (!nifParam) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end("<p style='font-family:sans-serif;padding:20px;color:red'>Le NIF est obligatoire.</p>");
      return;
    }

    try {
      // 1. Format the NIF with dashes for MSPP server
      const rawNif = nifParam.replace(/\D/g, "");
      let nifFormatted = rawNif;
      if (rawNif.length === 10) {
        nifFormatted = rawNif.replace(/(\d{3})(\d{3})(\d{3})(\d{1})/, "$1-$2-$3-$4");
      }

      const msppUrl = "https://mspp.gouv.ht/verification-permis";
      const formData = new URLSearchParams();
      formData.append("nif", nifFormatted);

      const msppRes = await fetch(msppUrl, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (compatible)"
        }
      });

      let html = await msppRes.text();

      // Convert relative URLs to absolute URLs so CSS and images load correctly
      html = html.replace(/href="\/(?!\/)/g, 'href="https://mspp.gouv.ht/');
      html = html.replace(/src="\/(?!\/)/g, 'src="https://mspp.gouv.ht/');

      // Rewrite the form to stay inside our iframe via GET, so user can re-search and see new results
      html = html.replace(/<form method="post" action="https:\/\/mspp\.gouv\.ht\/verification-permis"/i, '<form method="get" action="/api/local/mspp/verify"');
      // In case the replacement above didn't catch it due to spacing
      html = html.replace(/action="https:\/\/mspp\.gouv\.ht\/verification-permis"/i, 'action="/api/local/mspp/verify"');
      html = html.replace(/method="post"[^>]*action="\/api\/local\/mspp\/verify"/i, 'method="get" action="/api/local/mspp/verify"');

      // Pre-fill the input
      html = html.replace('id="nif"', `id="nif" value="${nifFormatted}"`);

      // Hide non-essential parts (header, footer, navigation) to keep it compact
      const injectedStyle = `
      <style>
        .site-header, 
        .site-footer, 
        #toolbar-administration,
        /* Try to hide any other top navs if any */
        header, footer {
          display: none !important;
        }
        body {
          padding-top: 0 !important;
          margin-top: 0 !important;
          background-color: transparent !important;
        }
        .main-container {
          padding-top: 20px !important;
        }
      </style>
      </head>
      `;

      html = html.replace('</head>', injectedStyle);

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<p style='font-family:sans-serif;padding:20px;color:red'>Erreur de connexion au site du MSPP : ${(err as Error).message}</p>`);
    }
    return;
  }

  throw new HttpError(404, "Route API locale introuvable.");
}

function createLocalSqliteMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(API_PREFIX)) {
      next();
      return;
    }

    void handleApiRequest(req, res).catch((error) => {
      respondError(res, error);
    });
  };
}

export function localSqliteApiPlugin(): Plugin {
  const middleware = createLocalSqliteMiddleware();

  return {
    name: "local-sqlite-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}
