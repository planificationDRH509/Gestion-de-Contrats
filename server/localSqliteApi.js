var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import fs from "node:fs";
import path from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
var HttpError = /** @class */ (function (_super) {
    __extends(HttpError, _super);
    function HttpError(status, message) {
        var _this = _super.call(this, message) || this;
        _this.status = status;
        return _this;
    }
    return HttpError;
}(Error));
var API_PREFIX = "/api/local";
var SQLITE_FILENAME = "contribution.sqlite";
var WORKSPACES = [
    { id: "workspace_default", name: "Planification" },
    { id: "workspace_mouvement", name: "Mouvement" },
    { id: "workspace_avantages", name: "Avantages Sociaux" }
];
var ALLOWED_STATUSES = new Set([
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
function nowIso() {
    return new Date().toISOString();
}
function asString(value) {
    return typeof value === "string" ? value : "";
}
function asNullableString(value) {
    if (typeof value !== "string") {
        return null;
    }
    var trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}
function asNumber(value, fallback) {
    if (fallback === void 0) { fallback = 0; }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        var parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
}
function asInteger(value, fallback) {
    if (fallback === void 0) { fallback = 0; }
    var parsed = Math.trunc(asNumber(value, fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
}
function parseBody(req) {
    return new Promise(function (resolve, reject) {
        var chunks = [];
        req.on("data", function (chunk) { return chunks.push(Buffer.from(chunk)); });
        req.on("end", function () {
            if (chunks.length === 0) {
                resolve({});
                return;
            }
            var raw = Buffer.concat(chunks).toString("utf8");
            try {
                var parsed = JSON.parse(raw);
                resolve(parsed && typeof parsed === "object" ? parsed : {});
            }
            catch (_a) {
                reject(new HttpError(400, "Corps JSON invalide."));
            }
        });
        req.on("error", function () { return reject(new HttpError(400, "Requête invalide.")); });
    });
}
function sendJson(res, status, payload) {
    var body = JSON.stringify(payload);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
}
function respondError(res, error) {
    if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
    }
    var message = error instanceof Error ? error.message : "Erreur interne SQLite locale.";
    sendJson(res, 500, { error: message });
}
function quoteIdentifier(value) {
    return "\"".concat(value.replace(/"/g, "\"\""), "\"");
}
function toSqlLiteral(value) {
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
        return "X'".concat(Buffer.from(value).toString("hex"), "'");
    }
    var text = String(value);
    return "'".concat(text.replace(/'/g, "''"), "'");
}
function parseDateInput(value) {
    var _a = value.split("-"), yearRaw = _a[0], monthRaw = _a[1], dayRaw = _a[2];
    var year = Number(yearRaw);
    var month = Number(monthRaw);
    var day = Number(dayRaw);
    if (!year || !month || !day)
        return null;
    var parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function toValidDate(value) {
    if (!value)
        return null;
    var parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function isDateInRange(date, startInclusive, endExclusive) {
    return date >= startInclusive && date < endExclusive;
}
function getContractActivityDate(contract) {
    var _a;
    var created = (_a = toValidDate(contract.createdAt)) !== null && _a !== void 0 ? _a : new Date();
    var updated = toValidDate(contract.updatedAt);
    if (updated && updated.getTime() > created.getTime()) {
        return updated;
    }
    return created;
}
function getContractStartDate(contract) {
    var _a, _b;
    var createdAt = (_a = toValidDate(contract.createdAt)) !== null && _a !== void 0 ? _a : new Date();
    var endYear = createdAt.getFullYear();
    if (createdAt.getMonth() >= 9) {
        endYear += 1;
    }
    var durationMonths = (_b = contract.durationMonths) !== null && _b !== void 0 ? _b : 12;
    var targetStartMonth = 8 - durationMonths + 1;
    var startDate = new Date(endYear, targetStartMonth, 1);
    while (startDate.getDay() !== 1) {
        startDate.setDate(startDate.getDate() + 1);
    }
    return startDate;
}
function getCurrentFiscalYearStart(now) {
    if (now === void 0) { now = new Date(); }
    var fiscalStartYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    return new Date(fiscalStartYear, 9, 1);
}
function matchesContractDateFilter(contract, mode, options) {
    var _a;
    if (options === void 0) { options = {}; }
    if (!mode || mode === "all") {
        return true;
    }
    var now = (_a = options.now) !== null && _a !== void 0 ? _a : new Date();
    if (mode === "fiscal_year_current") {
        var contractStart = getContractStartDate(contract);
        var fiscalStart = startOfDay(getCurrentFiscalYearStart(now));
        var tomorrow = new Date(startOfDay(now));
        tomorrow.setDate(tomorrow.getDate() + 1);
        return isDateInRange(contractStart, fiscalStart, tomorrow);
    }
    var activityDate = getContractActivityDate(contract);
    var todayStart = startOfDay(now);
    if (mode === "day") {
        var explicitDay = options.dayDateInput ? parseDateInput(options.dayDateInput) : null;
        var dayStart = explicitDay ? startOfDay(explicitDay) : todayStart;
        var nextDay = new Date(dayStart);
        nextDay.setDate(nextDay.getDate() + 1);
        return isDateInRange(activityDate, dayStart, nextDay);
    }
    if (mode === "range") {
        var explicitStart = options.rangeStartInput ? parseDateInput(options.rangeStartInput) : null;
        var explicitEnd = options.rangeEndInput ? parseDateInput(options.rangeEndInput) : null;
        if (!explicitStart && !explicitEnd) {
            return true;
        }
        var startBoundary = explicitStart ? startOfDay(explicitStart) : null;
        var endBoundary = explicitEnd ? startOfDay(explicitEnd) : null;
        if (startBoundary && activityDate < startBoundary) {
            return false;
        }
        if (endBoundary) {
            var nextDay = new Date(endBoundary);
            nextDay.setDate(nextDay.getDate() + 1);
            if (activityDate >= nextDay) {
                return false;
            }
        }
        return true;
    }
    if (mode === "week") {
        var dayOfWeek = todayStart.getDay();
        var diffToMonday = (dayOfWeek + 6) % 7;
        var weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - diffToMonday);
        var nextWeek = new Date(weekStart);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return isDateInRange(activityDate, weekStart, nextWeek);
    }
    if (mode === "month") {
        var monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
        var nextMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);
        return isDateInRange(activityDate, monthStart, nextMonth);
    }
    return true;
}
function contractMatchesQuery(contract, query) {
    var _a, _b;
    var normalized = query.toLowerCase();
    return [
        contract.firstName,
        contract.lastName,
        (_a = contract.nif) !== null && _a !== void 0 ? _a : "",
        (_b = contract.ninu) !== null && _b !== void 0 ? _b : "",
        contract.position,
        contract.assignment
    ].some(function (value) { return value.toLowerCase().includes(normalized); });
}
function sortContracts(contracts, sort) {
    var sorted = __spreadArray([], contracts, true);
    switch (sort) {
        case "createdAt_asc":
            return sorted.sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); });
        case "name_asc":
            return sorted.sort(function (a, b) { return "".concat(a.lastName, " ").concat(a.firstName).localeCompare("".concat(b.lastName, " ").concat(b.firstName)); });
        case "name_desc":
            return sorted.sort(function (a, b) { return "".concat(b.lastName, " ").concat(b.firstName).localeCompare("".concat(a.lastName, " ").concat(a.firstName)); });
        case "createdAt_desc":
        default:
            return sorted.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    }
}
function fiscalYearFor(date) {
    var startYear = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
    var endYear = startYear + 1;
    var code = "".concat(String(startYear).slice(-2)).concat(String(endYear).slice(-2));
    var label = "".concat(startYear, "-").concat(endYear);
    return { code: code, label: label };
}
function parseHistory(value) {
    if (!value) {
        return {
            createdAt: nowIso(),
            createdBy: "Administrateur",
            updates: []
        };
    }
    try {
        var parsed = JSON.parse(value);
        return {
            createdAt: asString(parsed.createdAt) || nowIso(),
            createdBy: asString(parsed.createdBy) || "Administrateur",
            updates: Array.isArray(parsed.updates)
                ? parsed.updates.map(function (update) { return ({
                    updatedAt: asString(update === null || update === void 0 ? void 0 : update.updatedAt),
                    updatedBy: asString(update === null || update === void 0 ? void 0 : update.updatedBy),
                    changes: Array.isArray(update === null || update === void 0 ? void 0 : update.changes)
                        ? update.changes.map(function (item) { return asString(item); }).filter(Boolean)
                        : []
                }); })
                : []
        };
    }
    catch (_a) {
        return {
            createdAt: nowIso(),
            createdBy: "Administrateur",
            updates: []
        };
    }
}
function mapApplicant(row) {
    return {
        id: asString(row.nif),
        workspaceId: asString(row.workspace_id),
        gender: asString(row.sexe),
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
function mapDossier(row) {
    return {
        id: asString(row.id),
        workspaceId: asString(row.workspace_id),
        name: asString(row.name),
        isEphemeral: Number(row.is_ephemeral) === 1,
        priority: asString(row.priority),
        contractTargetCount: asInteger(row.contract_target_count, 0),
        comment: asNullableString(row.comment),
        deadlineDate: asNullableString(row.deadline_date),
        focalPoint: asNullableString(row.focal_point),
        roadmapSheetNumber: asNullableString(row.roadmap_sheet_number),
        createdAt: asString(row.created_at),
        updatedAt: asString(row.updated_at),
        deletedAt: asNullableString(row.deleted_at)
    };
}
function mapContract(row) {
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
        deletedAt: row.deleted_at
    };
}
function getDbFilePath() {
    var fromEnv = process.env.CONTRIBUTION_SQLITE_PATH;
    if (fromEnv === null || fromEnv === void 0 ? void 0 : fromEnv.trim()) {
        return path.resolve(process.cwd(), fromEnv.trim());
    }
    return path.resolve(process.cwd(), ".local-data", SQLITE_FILENAME);
}
function ensureDir(filePath) {
    var directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
}
var cachedDb = null;
function getDb() {
    if (cachedDb) {
        return cachedDb;
    }
    var filePath = getDbFilePath();
    ensureDir(filePath);
    var db = new DatabaseSync(filePath);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("\n    CREATE TABLE IF NOT EXISTS workspaces (\n      id TEXT PRIMARY KEY,\n      name TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      deleted_at TEXT\n    );\n\n    CREATE TABLE IF NOT EXISTS identification (\n      nif TEXT PRIMARY KEY,\n      nom TEXT NOT NULL,\n      prenom TEXT NOT NULL,\n      sexe TEXT NOT NULL CHECK (sexe IN ('Homme','Femme')),\n      ninu TEXT UNIQUE,\n      adresse TEXT NOT NULL,\n      workspace_id TEXT NOT NULL DEFAULT 'workspace_default',\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      deleted_at TEXT,\n      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE\n    );\n\n    CREATE INDEX IF NOT EXISTS identification_workspace_idx\n      ON identification (workspace_id);\n\n    CREATE INDEX IF NOT EXISTS identification_name_idx\n      ON identification (workspace_id, nom, prenom);\n\n    CREATE INDEX IF NOT EXISTS identification_ninu_idx\n      ON identification (workspace_id, ninu);\n\n    CREATE TABLE IF NOT EXISTS dossiers (\n      id TEXT PRIMARY KEY,\n      workspace_id TEXT NOT NULL,\n      id_contrat TEXT,\n      name TEXT NOT NULL,\n      is_ephemeral INTEGER NOT NULL DEFAULT 0,\n      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgence')),\n      contract_target_count INTEGER NOT NULL DEFAULT 0 CHECK (contract_target_count >= 0),\n      comment TEXT,\n      deadline_date TEXT,\n      focal_point TEXT,\n      roadmap_sheet_number TEXT,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      deleted_at TEXT,\n      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE\n    );\n\n    CREATE UNIQUE INDEX IF NOT EXISTS dossiers_workspace_name_unique_idx\n      ON dossiers (workspace_id, name COLLATE NOCASE)\n      WHERE deleted_at IS NULL;\n\n    CREATE INDEX IF NOT EXISTS dossiers_workspace_idx\n      ON dossiers (workspace_id);\n\n    CREATE TABLE IF NOT EXISTS contrat (\n      id_contrat TEXT PRIMARY KEY,\n      nif TEXT NOT NULL,\n      duree_contrat INTEGER NOT NULL DEFAULT 12,\n      salaire TEXT NOT NULL,\n      annee_fiscale TEXT NOT NULL,\n      salaire_en_chiffre REAL NOT NULL,\n      titre TEXT NOT NULL,\n      lieu_affectation TEXT NOT NULL,\n      historique_saisie TEXT NOT NULL,\n      workspace_id TEXT NOT NULL,\n      dossier_id TEXT,\n      status TEXT NOT NULL DEFAULT 'draft'\n        CHECK (status IN ('draft','final','saisie','correction','impression_partiel','imprime','signe','transfere','classe')),\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      deleted_at TEXT,\n      FOREIGN KEY (nif) REFERENCES identification(nif) ON DELETE RESTRICT ON UPDATE CASCADE,\n      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,\n      FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE SET NULL\n    );\n\n    CREATE INDEX IF NOT EXISTS contrat_workspace_idx\n      ON contrat (workspace_id);\n\n    CREATE INDEX IF NOT EXISTS contrat_nif_idx\n      ON contrat (workspace_id, nif);\n\n    CREATE INDEX IF NOT EXISTS contrat_dossier_idx\n      ON contrat (workspace_id, dossier_id);\n\n    CREATE TABLE IF NOT EXISTS contract_print_jobs (\n      id TEXT PRIMARY KEY,\n      workspace_id TEXT NOT NULL,\n      contract_ids_json TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      printed_at TEXT,\n      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE\n    );\n\n    CREATE TABLE IF NOT EXISTS autocompletion (\n      id TEXT PRIMARY KEY,\n      type TEXT NOT NULL CHECK (type IN ('address','position','institution')),\n      label TEXT NOT NULL,\n      default_salary INTEGER,\n      address_keywords TEXT,\n      order_index INTEGER NOT NULL DEFAULT 0,\n      workspace_id TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE\n    );\n\n    CREATE INDEX IF NOT EXISTS autocompletion_workspace_type_idx\n      ON autocompletion (workspace_id, type);\n  ");
    var now = nowIso();
    var upsertWorkspace = db.prepare("\n    INSERT INTO workspaces (id, name, created_at, updated_at)\n    VALUES (:id, :name, :created_at, :updated_at)\n    ON CONFLICT(id) DO UPDATE SET\n      name = excluded.name,\n      updated_at = excluded.updated_at\n  ");
    for (var _i = 0, WORKSPACES_1 = WORKSPACES; _i < WORKSPACES_1.length; _i++) {
        var workspace = WORKSPACES_1[_i];
        upsertWorkspace.run({
            id: workspace.id,
            name: workspace.name,
            created_at: now,
            updated_at: now
        });
    }
    var existingAutoCount = db.prepare("SELECT count(*) as c FROM autocompletion WHERE workspace_id = 'workspace_default'").get();
    if (existingAutoCount.c === 0) {
        var addresses = [
            "Port-au-Prince", "Delmas", "Pétion-Ville", "Tabarre", "Croix-des-Bouquets",
            "Carrefour", "Kenscoff", "Gressier", "Léogâne", "Jacmel", "Les Cayes",
            "Cap-Haïtien", "Gonaïves", "Saint-Marc", "Jérémie", "Hinche"
        ];
        var positions = [
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
        var institutions = [
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
        var insertAuto_1 = db.prepare("\n        INSERT INTO autocompletion (id, type, label, default_salary, address_keywords, order_index, workspace_id, created_at, updated_at)\n        VALUES (:id, :type, :label, :default_salary, :address_keywords, :order_index, :workspace_id, :created_at, :updated_at)\n    ");
        addresses.forEach(function (label, idx) {
            insertAuto_1.run({
                id: randomUUID(), type: "address",
                label: label,
                default_salary: null, address_keywords: null,
                order_index: idx, workspace_id: "workspace_default", created_at: now, updated_at: now
            });
        });
        positions.forEach(function (p, idx) {
            insertAuto_1.run({
                id: randomUUID(), type: "position", label: p.l, default_salary: p.s, address_keywords: null,
                order_index: idx, workspace_id: "workspace_default", created_at: now, updated_at: now
            });
        });
        institutions.forEach(function (i, idx) {
            insertAuto_1.run({
                id: randomUUID(), type: "institution", label: i.l, default_salary: null, address_keywords: JSON.stringify(i.k),
                order_index: idx, workspace_id: "workspace_default", created_at: now, updated_at: now
            });
        });
    }
    cachedDb = db;
    return db;
}
function buildSqlBackupDump(db) {
    var lines = [];
    var generatedAt = nowIso();
    lines.push("-- Contribution SQLite backup");
    lines.push("-- Generated at ".concat(generatedAt));
    lines.push("PRAGMA foreign_keys=OFF;");
    lines.push("BEGIN TRANSACTION;");
    var schemaRows = db
        .prepare("\n      SELECT type, name, sql\n      FROM sqlite_master\n      WHERE sql IS NOT NULL\n        AND name NOT LIKE 'sqlite_%'\n      ORDER BY\n        CASE type\n          WHEN 'table' THEN 0\n          WHEN 'index' THEN 1\n          WHEN 'trigger' THEN 2\n          WHEN 'view' THEN 3\n          ELSE 4\n        END,\n        name\n    ")
        .all();
    for (var _i = 0, schemaRows_1 = schemaRows; _i < schemaRows_1.length; _i++) {
        var row = schemaRows_1[_i];
        var statement = row.sql.trim();
        if (statement.length) {
            lines.push("".concat(statement, ";"));
        }
    }
    var tableRows = db
        .prepare("\n      SELECT name\n      FROM sqlite_master\n      WHERE type = 'table'\n        AND name NOT LIKE 'sqlite_%'\n      ORDER BY name\n    ")
        .all();
    for (var _a = 0, tableRows_1 = tableRows; _a < tableRows_1.length; _a++) {
        var tableRow = tableRows_1[_a];
        var tableName = asString(tableRow.name);
        if (!tableName) {
            continue;
        }
        var tableInfo = db
            .prepare("PRAGMA table_info(".concat(quoteIdentifier(tableName), ")"))
            .all();
        var columns = tableInfo
            .map(function (column) { return asString(column.name); })
            .filter(function (column) { return column.length > 0; });
        if (columns.length === 0) {
            continue;
        }
        var selectSql = "SELECT ".concat(columns.map(quoteIdentifier).join(", "), " FROM ").concat(quoteIdentifier(tableName));
        var rows = db.prepare(selectSql).all();
        var _loop_1 = function (row) {
            var values = columns.map(function (columnName) { return toSqlLiteral(row[columnName]); });
            lines.push("INSERT INTO ".concat(quoteIdentifier(tableName), " (").concat(columns
                .map(quoteIdentifier)
                .join(", "), ") VALUES (").concat(values.join(", "), ");"));
        };
        for (var _b = 0, rows_1 = rows; _b < rows_1.length; _b++) {
            var row = rows_1[_b];
            _loop_1(row);
        }
    }
    lines.push("COMMIT;");
    lines.push("PRAGMA foreign_keys=ON;");
    lines.push("");
    return lines.join("\n");
}
function buildContractRows(workspaceId) {
    var db = getDb();
    var rows = db
        .prepare("\n      SELECT\n        c.id_contrat,\n        c.workspace_id,\n        c.dossier_id,\n        c.nif,\n        c.status,\n        c.duree_contrat,\n        c.salaire_en_chiffre,\n        c.salaire,\n        c.titre,\n        c.lieu_affectation,\n        c.annee_fiscale,\n        c.created_at,\n        c.updated_at,\n        c.deleted_at,\n        c.historique_saisie,\n        i.nom,\n        i.prenom,\n        i.sexe,\n        i.ninu,\n        i.adresse\n      FROM contrat c\n      INNER JOIN identification i ON i.nif = c.nif\n      WHERE c.workspace_id = :workspace_id\n        AND c.deleted_at IS NULL\n    ")
        .all({ workspace_id: workspaceId });
    return rows;
}
function buildContractId(db, date) {
    if (date === void 0) { date = new Date(); }
    var fiscal = fiscalYearFor(date);
    var existsStatement = db.prepare("SELECT id_contrat FROM contrat WHERE id_contrat = :id LIMIT 1");
    for (var index = 0; index < 200; index += 1) {
        var suffix = String(randomInt(0, 10000)).padStart(4, "0");
        var candidate = "".concat(fiscal.code).concat(suffix);
        var existing = existsStatement.get({ id: candidate });
        if (!existing) {
            return { id: candidate, fiscalYearLabel: fiscal.label };
        }
    }
    throw new HttpError(500, "Impossible de générer un ID_Contrat unique.");
}
function operatorFromRequest(req) {
    var raw = req.headers["x-operator-name"];
    if (typeof raw === "string" && raw.trim()) {
        return raw.trim();
    }
    if (Array.isArray(raw)) {
        var first = raw.find(function (item) { return item.trim(); });
        if (first) {
            return first.trim();
        }
    }
    return "Administrateur";
}
function handleApiRequest(req, res) {
    return __awaiter(this, void 0, void 0, function () {
        var db, method, url, pathname, dump, timestamp, filename, rows, body, workspaceId, nif, ninu, gender, firstName, lastName, address, timestamp, byNif, byNinu, target, previousNif, nifOwner, saved, workspaceId, nif, ninu, row, applicantByIdMatch, nif, row, workspaceId, rows, body, workspaceId, name_1, existing, timestamp, id, created, body, id, workspaceId, timestamp, dossierDeletion, unassigned, dossierByIdMatch, id, row, id, body, workspaceId, current, nextNameRaw, nextName, duplicate, timestamp, updated, body, payload_1, workspaceId, page, pageSize, items, q_1, targetDossier_1, total, start, paged, body, workspaceId, ids, idSet_1, items, body, workspaceId, nif, identification, durationMonths, salaryNumber, salaryText, position, assignment, status_1, timestamp, _a, id, fiscalYearLabel, operator, history_1, createdRow, body, workspaceId, contractIds, timestamp, dossierId, statement, updatedCount, _i, contractIds_1, contractId, result, body, workspaceId, contractIds, status_2, timestamp, statement, updatedCount, _b, contractIds_2, contractId, result, body, workspaceId, contractIds, durationMonths, timestamp, statement, updatedCount, _c, contractIds_3, contractId, result, body, id, workspaceId, timestamp, contractByIdMatch, id, row, id, body, current, nextNif, linkedIdentification, nextStatus, nextDuration, nextSalaryNumber, nextSalaryText, nextTitle, nextAssignment, nextDossierId, timestamp, operator, history_2, changes, updatedRow, body, workspaceId, contractIds, timestamp, id, searchParams, workspaceId, rows, result_1, body, workspaceId_1, data, now_1, insertAuto_2, searchParams, nifParam, rawNif, nifFormatted, msppUrl, formData, msppRes, html, injectedStyle, err_1;
        var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        return __generator(this, function (_r) {
            switch (_r.label) {
                case 0:
                    db = getDb();
                    method = ((_d = req.method) !== null && _d !== void 0 ? _d : "GET").toUpperCase();
                    url = new URL((_e = req.url) !== null && _e !== void 0 ? _e : "/", "http://localhost");
                    pathname = url.pathname;
                    if (method === "OPTIONS") {
                        sendJson(res, 200, { ok: true });
                        return [2 /*return*/];
                    }
                    if (pathname === "".concat(API_PREFIX, "/health") && method === "GET") {
                        sendJson(res, 200, { ok: true, provider: "sqlite", path: getDbFilePath() });
                        return [2 /*return*/];
                    }
                    if (pathname === "".concat(API_PREFIX, "/backup/sql") && method === "GET") {
                        dump = buildSqlBackupDump(db);
                        timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                        filename = "contribution-backup-".concat(timestamp, ".sql");
                        res.statusCode = 200;
                        res.setHeader("Content-Type", "application/sql; charset=utf-8");
                        res.setHeader("Content-Disposition", "attachment; filename=\"".concat(filename, "\""));
                        res.setHeader("Cache-Control", "no-store");
                        res.end(dump);
                        return [2 /*return*/];
                    }
                    if (pathname === "".concat(API_PREFIX, "/workspaces") && method === "GET") {
                        rows = db
                            .prepare("\n        SELECT id, name, created_at, updated_at, deleted_at\n        FROM workspaces\n        WHERE deleted_at IS NULL\n        ORDER BY created_at ASC\n      ")
                            .all();
                        sendJson(res, 200, rows.map(function (row) { return ({
                            id: asString(row.id),
                            name: asString(row.name),
                            createdAt: asString(row.created_at),
                            updatedAt: asString(row.updated_at),
                            deletedAt: asNullableString(row.deleted_at)
                        }); }));
                        return [2 /*return*/];
                    }
                    if (!(pathname === "".concat(API_PREFIX, "/applicants/upsert") && method === "POST")) return [3 /*break*/, 2];
                    return [4 /*yield*/, parseBody(req)];
                case 1:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId) || "workspace_default";
                    nif = asNullableString(body.nif);
                    ninu = asNullableString(body.ninu);
                    gender = asString(body.gender);
                    firstName = asString(body.firstName).trim();
                    lastName = asString(body.lastName).trim();
                    address = asString(body.address).trim();
                    if (!nif) {
                        throw new HttpError(400, "Le NIF est obligatoire pour la table identification.");
                    }
                    if (!gender || (gender !== "Homme" && gender !== "Femme")) {
                        throw new HttpError(400, "Le sexe est invalide.");
                    }
                    if (!firstName || !lastName || !address) {
                        throw new HttpError(400, "Nom, prénom et adresse sont obligatoires.");
                    }
                    timestamp = nowIso();
                    byNif = db
                        .prepare("\n        SELECT *\n        FROM identification\n        WHERE nif = :nif\n          AND deleted_at IS NULL\n        LIMIT 1\n      ")
                        .get({ nif: nif });
                    byNinu = ninu
                        ? ((_f = db
                            .prepare("\n            SELECT *\n            FROM identification\n            WHERE ninu = :ninu\n              AND deleted_at IS NULL\n            LIMIT 1\n          ")
                            .get({ ninu: ninu })) !== null && _f !== void 0 ? _f : undefined)
                        : undefined;
                    if (byNif && byNinu && asString(byNif.nif) !== asString(byNinu.nif)) {
                        throw new HttpError(400, "Conflit: ce NIF et ce NINU appartiennent à deux enregistrements différents.");
                    }
                    target = byNif !== null && byNif !== void 0 ? byNif : byNinu;
                    if (target) {
                        previousNif = asString(target.nif);
                        if (previousNif !== nif) {
                            nifOwner = db
                                .prepare("\n            SELECT nif\n            FROM identification\n            WHERE nif = :nif\n              AND deleted_at IS NULL\n            LIMIT 1\n          ")
                                .get({ nif: nif });
                            if (nifOwner && asString(nifOwner.nif) !== previousNif) {
                                throw new HttpError(400, "Ce NIF existe déjà.");
                            }
                        }
                        db.prepare("\n        UPDATE identification\n        SET nif = :new_nif,\n            nom = :nom,\n            prenom = :prenom,\n            sexe = :sexe,\n            ninu = :ninu,\n            adresse = :adresse,\n            workspace_id = :workspace_id,\n            updated_at = :updated_at,\n            deleted_at = NULL\n        WHERE nif = :old_nif\n      ").run({
                            new_nif: nif,
                            nom: lastName,
                            prenom: firstName,
                            sexe: gender,
                            ninu: ninu,
                            adresse: address,
                            workspace_id: workspaceId,
                            updated_at: timestamp,
                            old_nif: previousNif
                        });
                    }
                    else {
                        db.prepare("\n        INSERT INTO identification (\n          nif,\n          nom,\n          prenom,\n          sexe,\n          ninu,\n          adresse,\n          workspace_id,\n          created_at,\n          updated_at\n        ) VALUES (\n          :nif,\n          :nom,\n          :prenom,\n          :sexe,\n          :ninu,\n          :adresse,\n          :workspace_id,\n          :created_at,\n          :updated_at\n        )\n      ").run({
                            nif: nif,
                            nom: lastName,
                            prenom: firstName,
                            sexe: gender,
                            ninu: ninu,
                            adresse: address,
                            workspace_id: workspaceId,
                            created_at: timestamp,
                            updated_at: timestamp
                        });
                    }
                    saved = db
                        .prepare("SELECT * FROM identification WHERE nif = :nif LIMIT 1")
                        .get({ nif: nif });
                    sendJson(res, 200, mapApplicant(saved));
                    return [2 /*return*/];
                case 2:
                    if (pathname === "".concat(API_PREFIX, "/applicants/find") && method === "GET") {
                        workspaceId = asString(url.searchParams.get("workspaceId"));
                        nif = asNullableString(url.searchParams.get("nif"));
                        ninu = asNullableString(url.searchParams.get("ninu"));
                        if (!workspaceId) {
                            throw new HttpError(400, "workspaceId est obligatoire.");
                        }
                        if (!nif && !ninu) {
                            sendJson(res, 200, null);
                            return [2 /*return*/];
                        }
                        row = db
                            .prepare("\n        SELECT *\n        FROM identification\n        WHERE workspace_id = :workspace_id\n          AND deleted_at IS NULL\n          AND (\n            (:nif IS NOT NULL AND nif = :nif)\n            OR (:ninu IS NOT NULL AND ninu = :ninu)\n          )\n        LIMIT 1\n      ")
                            .get({ workspace_id: workspaceId, nif: nif, ninu: ninu });
                        sendJson(res, 200, row ? mapApplicant(row) : null);
                        return [2 /*return*/];
                    }
                    applicantByIdMatch = pathname.match(/^\/api\/local\/applicants\/([^/]+)$/);
                    if (applicantByIdMatch && method === "GET") {
                        nif = decodeURIComponent(applicantByIdMatch[1]);
                        row = db
                            .prepare("\n        SELECT *\n        FROM identification\n        WHERE nif = :nif\n          AND deleted_at IS NULL\n        LIMIT 1\n      ")
                            .get({ nif: nif });
                        sendJson(res, 200, row ? mapApplicant(row) : null);
                        return [2 /*return*/];
                    }
                    if (pathname === "".concat(API_PREFIX, "/dossiers") && method === "GET") {
                        workspaceId = asString(url.searchParams.get("workspaceId"));
                        if (!workspaceId) {
                            throw new HttpError(400, "workspaceId est obligatoire.");
                        }
                        rows = db
                            .prepare("\n        SELECT *\n        FROM dossiers\n        WHERE workspace_id = :workspace_id\n          AND deleted_at IS NULL\n        ORDER BY created_at DESC\n      ")
                            .all({ workspace_id: workspaceId });
                        sendJson(res, 200, rows.map(mapDossier));
                        return [2 /*return*/];
                    }
                    if (!(pathname === "".concat(API_PREFIX, "/dossiers") && method === "POST")) return [3 /*break*/, 4];
                    return [4 /*yield*/, parseBody(req)];
                case 3:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId) || "workspace_default";
                    name_1 = asString(body.name).trim();
                    if (!name_1) {
                        throw new HttpError(400, "Le nom du dossier est obligatoire.");
                    }
                    existing = db
                        .prepare("\n        SELECT *\n        FROM dossiers\n        WHERE workspace_id = :workspace_id\n          AND deleted_at IS NULL\n          AND lower(name) = lower(:name)\n        LIMIT 1\n      ")
                        .get({ workspace_id: workspaceId, name: name_1 });
                    if (existing) {
                        sendJson(res, 200, mapDossier(existing));
                        return [2 /*return*/];
                    }
                    timestamp = nowIso();
                    id = randomUUID();
                    db.prepare("\n      INSERT INTO dossiers (\n        id,\n        workspace_id,\n        id_contrat,\n        name,\n        is_ephemeral,\n        priority,\n        contract_target_count,\n        comment,\n        deadline_date,\n        focal_point,\n        roadmap_sheet_number,\n        created_at,\n        updated_at\n      ) VALUES (\n        :id,\n        :workspace_id,\n        NULL,\n        :name,\n        :is_ephemeral,\n        :priority,\n        :contract_target_count,\n        :comment,\n        :deadline_date,\n        :focal_point,\n        :roadmap_sheet_number,\n        :created_at,\n        :updated_at\n      )\n    ").run({
                        id: id,
                        workspace_id: workspaceId,
                        name: name_1,
                        is_ephemeral: body.isEphemeral ? 1 : 0,
                        priority: asString(body.priority) === "urgence" ? "urgence" : "normal",
                        contract_target_count: Math.max(0, asInteger(body.contractTargetCount, 0)),
                        comment: asNullableString(body.comment),
                        deadline_date: asNullableString(body.deadlineDate),
                        focal_point: asNullableString(body.focalPoint),
                        roadmap_sheet_number: asNullableString(body.roadmapSheetNumber),
                        created_at: timestamp,
                        updated_at: timestamp
                    });
                    created = db
                        .prepare("SELECT * FROM dossiers WHERE id = :id LIMIT 1")
                        .get({ id: id });
                    sendJson(res, 200, mapDossier(created));
                    return [2 /*return*/];
                case 4:
                    if (!(pathname === "".concat(API_PREFIX, "/dossiers/delete") && method === "POST")) return [3 /*break*/, 6];
                    return [4 /*yield*/, parseBody(req)];
                case 5:
                    body = _r.sent();
                    id = asString(body.id);
                    workspaceId = asString(body.workspaceId);
                    if (!id || !workspaceId) {
                        throw new HttpError(400, "id et workspaceId sont obligatoires.");
                    }
                    timestamp = nowIso();
                    dossierDeletion = db
                        .prepare("\n        UPDATE dossiers\n        SET deleted_at = :timestamp,\n            updated_at = :timestamp\n        WHERE id = :id\n          AND workspace_id = :workspace_id\n          AND deleted_at IS NULL\n      ")
                        .run({
                        timestamp: timestamp,
                        id: id,
                        workspace_id: workspaceId
                    });
                    if (((_g = dossierDeletion.changes) !== null && _g !== void 0 ? _g : 0) === 0) {
                        sendJson(res, 200, 0);
                        return [2 /*return*/];
                    }
                    unassigned = db
                        .prepare("\n        UPDATE contrat\n        SET dossier_id = NULL,\n            updated_at = :timestamp\n        WHERE workspace_id = :workspace_id\n          AND deleted_at IS NULL\n          AND dossier_id = :dossier_id\n      ")
                        .run({
                        timestamp: timestamp,
                        workspace_id: workspaceId,
                        dossier_id: id
                    });
                    sendJson(res, 200, (_h = unassigned.changes) !== null && _h !== void 0 ? _h : 0);
                    return [2 /*return*/];
                case 6:
                    dossierByIdMatch = pathname.match(/^\/api\/local\/dossiers\/([^/]+)$/);
                    if (dossierByIdMatch && method === "GET") {
                        id = decodeURIComponent(dossierByIdMatch[1]);
                        row = db
                            .prepare("\n        SELECT *\n        FROM dossiers\n        WHERE id = :id\n          AND deleted_at IS NULL\n        LIMIT 1\n      ")
                            .get({ id: id });
                        sendJson(res, 200, row ? mapDossier(row) : null);
                        return [2 /*return*/];
                    }
                    if (!(dossierByIdMatch && method === "PATCH")) return [3 /*break*/, 8];
                    id = decodeURIComponent(dossierByIdMatch[1]);
                    return [4 /*yield*/, parseBody(req)];
                case 7:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId);
                    current = db
                        .prepare("\n        SELECT *\n        FROM dossiers\n        WHERE id = :id\n          AND workspace_id = :workspace_id\n          AND deleted_at IS NULL\n        LIMIT 1\n      ")
                        .get({ id: id, workspace_id: workspaceId });
                    if (!current) {
                        throw new HttpError(404, "Dossier introuvable.");
                    }
                    nextNameRaw = asNullableString(body.name);
                    nextName = nextNameRaw !== null && nextNameRaw !== void 0 ? nextNameRaw : asString(current.name);
                    if (!nextName) {
                        throw new HttpError(400, "Le nom du dossier est obligatoire.");
                    }
                    duplicate = db
                        .prepare("\n        SELECT id\n        FROM dossiers\n        WHERE workspace_id = :workspace_id\n          AND id <> :id\n          AND deleted_at IS NULL\n          AND lower(name) = lower(:name)\n        LIMIT 1\n      ")
                        .get({
                        workspace_id: workspaceId,
                        id: id,
                        name: nextName
                    });
                    if (duplicate) {
                        throw new HttpError(400, "Un dossier avec ce nom existe déjà.");
                    }
                    timestamp = nowIso();
                    db.prepare("\n      UPDATE dossiers\n      SET name = :name,\n          is_ephemeral = :is_ephemeral,\n          priority = :priority,\n          contract_target_count = :contract_target_count,\n          comment = :comment,\n          deadline_date = :deadline_date,\n          focal_point = :focal_point,\n          roadmap_sheet_number = :roadmap_sheet_number,\n          updated_at = :updated_at\n      WHERE id = :id\n    ").run({
                        id: id,
                        name: nextName,
                        is_ephemeral: body.isEphemeral !== undefined
                            ? (body.isEphemeral ? 1 : 0)
                            : Number(current.is_ephemeral) === 1
                                ? 1
                                : 0,
                        priority: body.priority !== undefined
                            ? asString(body.priority) === "urgence"
                                ? "urgence"
                                : "normal"
                            : asString(current.priority) === "urgence"
                                ? "urgence"
                                : "normal",
                        contract_target_count: body.contractTargetCount !== undefined
                            ? Math.max(0, asInteger(body.contractTargetCount, 0))
                            : Math.max(0, asInteger(current.contract_target_count, 0)),
                        comment: body.comment !== undefined
                            ? asNullableString(body.comment)
                            : asNullableString(current.comment),
                        deadline_date: body.deadlineDate !== undefined
                            ? asNullableString(body.deadlineDate)
                            : asNullableString(current.deadline_date),
                        focal_point: body.focalPoint !== undefined
                            ? asNullableString(body.focalPoint)
                            : asNullableString(current.focal_point),
                        roadmap_sheet_number: body.roadmapSheetNumber !== undefined
                            ? asNullableString(body.roadmapSheetNumber)
                            : asNullableString(current.roadmap_sheet_number),
                        updated_at: timestamp
                    });
                    updated = db
                        .prepare("SELECT * FROM dossiers WHERE id = :id LIMIT 1")
                        .get({ id: id });
                    sendJson(res, 200, mapDossier(updated));
                    return [2 /*return*/];
                case 8:
                    if (!(pathname === "".concat(API_PREFIX, "/contracts/list") && method === "POST")) return [3 /*break*/, 10];
                    return [4 /*yield*/, parseBody(req)];
                case 9:
                    body = _r.sent();
                    payload_1 = body;
                    workspaceId = asString(payload_1.workspaceId);
                    if (!workspaceId) {
                        throw new HttpError(400, "workspaceId est obligatoire.");
                    }
                    page = Math.max(1, asInteger(payload_1.page, 1));
                    pageSize = Math.max(1, asInteger(payload_1.pageSize, 10));
                    items = buildContractRows(workspaceId).map(mapContract);
                    if ((_j = payload_1.query) === null || _j === void 0 ? void 0 : _j.trim()) {
                        q_1 = payload_1.query.trim();
                        items = items.filter(function (item) { return contractMatchesQuery(item, q_1); });
                    }
                    if (payload_1.status) {
                        items = items.filter(function (item) { return item.status === payload_1.status; });
                    }
                    if (payload_1.dossierId !== undefined) {
                        targetDossier_1 = (_k = payload_1.dossierId) !== null && _k !== void 0 ? _k : null;
                        items = items.filter(function (item) { var _a; return ((_a = item.dossierId) !== null && _a !== void 0 ? _a : null) === targetDossier_1; });
                    }
                    if (payload_1.dateFilterMode && payload_1.dateFilterMode !== "all") {
                        items = items.filter(function (contract) {
                            return matchesContractDateFilter({
                                createdAt: contract.createdAt,
                                updatedAt: contract.updatedAt,
                                durationMonths: contract.durationMonths
                            }, payload_1.dateFilterMode, {
                                dayDateInput: payload_1.dateFilterDate,
                                rangeStartInput: payload_1.dateFilterStart,
                                rangeEndInput: payload_1.dateFilterEnd
                            });
                        });
                    }
                    total = items.length;
                    items = sortContracts(items, payload_1.sort);
                    start = (page - 1) * pageSize;
                    paged = items.slice(start, start + pageSize);
                    sendJson(res, 200, {
                        items: paged,
                        total: total,
                        page: page,
                        pageSize: pageSize
                    });
                    return [2 /*return*/];
                case 10:
                    if (!(pathname === "".concat(API_PREFIX, "/contracts/by-ids") && method === "POST")) return [3 /*break*/, 12];
                    return [4 /*yield*/, parseBody(req)];
                case 11:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId);
                    ids = Array.isArray(body.ids) ? body.ids.map(function (item) { return asString(item); }).filter(Boolean) : [];
                    if (!workspaceId) {
                        throw new HttpError(400, "workspaceId est obligatoire.");
                    }
                    if (ids.length === 0) {
                        sendJson(res, 200, []);
                        return [2 /*return*/];
                    }
                    idSet_1 = new Set(ids);
                    items = buildContractRows(workspaceId)
                        .map(mapContract)
                        .filter(function (item) { return idSet_1.has(item.id); });
                    sendJson(res, 200, items);
                    return [2 /*return*/];
                case 12:
                    if (!(pathname === "".concat(API_PREFIX, "/contracts") && method === "POST")) return [3 /*break*/, 14];
                    return [4 /*yield*/, parseBody(req)];
                case 13:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId) || "workspace_default";
                    nif = asNullableString(body.nif);
                    if (!nif) {
                        throw new HttpError(400, "Le NIF est obligatoire pour créer un contrat.");
                    }
                    identification = db
                        .prepare("\n        SELECT *\n        FROM identification\n        WHERE nif = :nif\n          AND deleted_at IS NULL\n        LIMIT 1\n      ")
                        .get({ nif: nif });
                    if (!identification) {
                        throw new HttpError(400, "Aucune fiche identification trouvée pour ce NIF.");
                    }
                    durationMonths = Math.max(1, Math.min(24, asInteger(body.durationMonths, 12)));
                    salaryNumber = asNumber(body.salaryNumber, 0);
                    salaryText = asString(body.salaryText).trim();
                    position = asString(body.position).trim();
                    assignment = asString(body.assignment).trim();
                    status_1 = asString(body.status).trim() || "saisie";
                    if (!salaryText || !position || !assignment) {
                        throw new HttpError(400, "Titre, lieu d'affectation et salaire texte sont obligatoires.");
                    }
                    if (!ALLOWED_STATUSES.has(status_1)) {
                        throw new HttpError(400, "Statut de contrat invalide.");
                    }
                    timestamp = nowIso();
                    _a = buildContractId(db), id = _a.id, fiscalYearLabel = _a.fiscalYearLabel;
                    operator = operatorFromRequest(req);
                    history_1 = {
                        createdAt: timestamp,
                        createdBy: operator,
                        updates: []
                    };
                    db.prepare("\n      INSERT INTO contrat (\n        id_contrat,\n        nif,\n        duree_contrat,\n        salaire,\n        annee_fiscale,\n        salaire_en_chiffre,\n        titre,\n        lieu_affectation,\n        historique_saisie,\n        workspace_id,\n        dossier_id,\n        status,\n        created_at,\n        updated_at,\n        deleted_at\n      ) VALUES (\n        :id_contrat,\n        :nif,\n        :duree_contrat,\n        :salaire,\n        :annee_fiscale,\n        :salaire_en_chiffre,\n        :titre,\n        :lieu_affectation,\n        :historique_saisie,\n        :workspace_id,\n        :dossier_id,\n        :status,\n        :created_at,\n        :updated_at,\n        NULL\n      )\n    ").run({
                        id_contrat: id,
                        nif: nif,
                        duree_contrat: durationMonths,
                        salaire: salaryText,
                        annee_fiscale: fiscalYearLabel,
                        salaire_en_chiffre: salaryNumber,
                        titre: position,
                        lieu_affectation: assignment,
                        historique_saisie: JSON.stringify(history_1),
                        workspace_id: workspaceId,
                        dossier_id: asNullableString(body.dossierId),
                        status: status_1,
                        created_at: timestamp,
                        updated_at: timestamp
                    });
                    createdRow = db
                        .prepare("\n        SELECT\n          c.id_contrat,\n          c.workspace_id,\n          c.dossier_id,\n          c.nif,\n          c.status,\n          c.duree_contrat,\n          c.salaire_en_chiffre,\n          c.salaire,\n          c.titre,\n          c.lieu_affectation,\n          c.annee_fiscale,\n          c.created_at,\n          c.updated_at,\n          c.deleted_at,\n          c.historique_saisie,\n          i.nom,\n          i.prenom,\n          i.sexe,\n          i.ninu,\n          i.adresse\n        FROM contrat c\n        INNER JOIN identification i ON i.nif = c.nif\n        WHERE c.id_contrat = :id\n        LIMIT 1\n      ")
                        .get({ id: id });
                    sendJson(res, 200, mapContract(createdRow));
                    return [2 /*return*/];
                case 14:
                    if (!(pathname === "".concat(API_PREFIX, "/contracts/assign-dossier") && method === "POST")) return [3 /*break*/, 16];
                    return [4 /*yield*/, parseBody(req)];
                case 15:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId);
                    contractIds = Array.isArray(body.contractIds)
                        ? body.contractIds.map(function (item) { return asString(item); }).filter(Boolean)
                        : [];
                    if (!workspaceId) {
                        throw new HttpError(400, "workspaceId est obligatoire.");
                    }
                    if (contractIds.length === 0) {
                        sendJson(res, 200, 0);
                        return [2 /*return*/];
                    }
                    timestamp = nowIso();
                    dossierId = asNullableString(body.dossierId);
                    statement = db.prepare("\n      UPDATE contrat\n      SET dossier_id = :dossier_id,\n          updated_at = :updated_at\n      WHERE id_contrat = :id_contrat\n        AND workspace_id = :workspace_id\n        AND deleted_at IS NULL\n    ");
                    updatedCount = 0;
                    for (_i = 0, contractIds_1 = contractIds; _i < contractIds_1.length; _i++) {
                        contractId = contractIds_1[_i];
                        result = statement.run({
                            dossier_id: dossierId,
                            updated_at: timestamp,
                            id_contrat: contractId,
                            workspace_id: workspaceId
                        });
                        updatedCount += Number((_l = result.changes) !== null && _l !== void 0 ? _l : 0);
                    }
                    sendJson(res, 200, updatedCount);
                    return [2 /*return*/];
                case 16:
                    if (!(pathname === "".concat(API_PREFIX, "/contracts/update-status") && method === "POST")) return [3 /*break*/, 18];
                    return [4 /*yield*/, parseBody(req)];
                case 17:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId);
                    contractIds = Array.isArray(body.contractIds)
                        ? body.contractIds.map(function (item) { return asString(item); }).filter(Boolean)
                        : [];
                    status_2 = asString(body.status);
                    if (!workspaceId) {
                        throw new HttpError(400, "workspaceId est obligatoire.");
                    }
                    if (contractIds.length === 0) {
                        sendJson(res, 200, 0);
                        return [2 /*return*/];
                    }
                    if (!ALLOWED_STATUSES.has(status_2)) {
                        throw new HttpError(400, "Statut invalide.");
                    }
                    timestamp = nowIso();
                    statement = db.prepare("\n      UPDATE contrat\n      SET status = :status,\n          updated_at = :updated_at\n      WHERE id_contrat = :id_contrat\n        AND workspace_id = :workspace_id\n        AND deleted_at IS NULL\n    ");
                    updatedCount = 0;
                    for (_b = 0, contractIds_2 = contractIds; _b < contractIds_2.length; _b++) {
                        contractId = contractIds_2[_b];
                        result = statement.run({
                            status: status_2,
                            updated_at: timestamp,
                            id_contrat: contractId,
                            workspace_id: workspaceId
                        });
                        updatedCount += Number((_m = result.changes) !== null && _m !== void 0 ? _m : 0);
                    }
                    sendJson(res, 200, updatedCount);
                    return [2 /*return*/];
                case 18:
                    if (!(pathname === "".concat(API_PREFIX, "/contracts/update-duration") && method === "POST")) return [3 /*break*/, 20];
                    return [4 /*yield*/, parseBody(req)];
                case 19:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId);
                    contractIds = Array.isArray(body.contractIds)
                        ? body.contractIds.map(function (item) { return asString(item); }).filter(Boolean)
                        : [];
                    durationMonths = Math.max(1, Math.min(24, asInteger(body.durationMonths, 12)));
                    if (!workspaceId) {
                        throw new HttpError(400, "workspaceId est obligatoire.");
                    }
                    if (contractIds.length === 0) {
                        sendJson(res, 200, 0);
                        return [2 /*return*/];
                    }
                    timestamp = nowIso();
                    statement = db.prepare("\n      UPDATE contrat\n      SET duree_contrat = :duree_contrat,\n          updated_at = :updated_at\n      WHERE id_contrat = :id_contrat\n        AND workspace_id = :workspace_id\n        AND deleted_at IS NULL\n    ");
                    updatedCount = 0;
                    for (_c = 0, contractIds_3 = contractIds; _c < contractIds_3.length; _c++) {
                        contractId = contractIds_3[_c];
                        result = statement.run({
                            duree_contrat: durationMonths,
                            updated_at: timestamp,
                            id_contrat: contractId,
                            workspace_id: workspaceId
                        });
                        updatedCount += Number((_o = result.changes) !== null && _o !== void 0 ? _o : 0);
                    }
                    sendJson(res, 200, updatedCount);
                    return [2 /*return*/];
                case 20:
                    if (!(pathname === "".concat(API_PREFIX, "/contracts/soft-delete") && method === "POST")) return [3 /*break*/, 22];
                    return [4 /*yield*/, parseBody(req)];
                case 21:
                    body = _r.sent();
                    id = asString(body.id);
                    workspaceId = asString(body.workspaceId);
                    if (!id || !workspaceId) {
                        throw new HttpError(400, "id et workspaceId sont obligatoires.");
                    }
                    timestamp = nowIso();
                    db.prepare("\n      UPDATE contrat\n      SET deleted_at = :deleted_at,\n          updated_at = :updated_at\n      WHERE id_contrat = :id_contrat\n        AND workspace_id = :workspace_id\n        AND deleted_at IS NULL\n    ").run({
                        deleted_at: timestamp,
                        updated_at: timestamp,
                        id_contrat: id,
                        workspace_id: workspaceId
                    });
                    sendJson(res, 200, { ok: true });
                    return [2 /*return*/];
                case 22:
                    contractByIdMatch = pathname.match(/^\/api\/local\/contracts\/([^/]+)$/);
                    if (contractByIdMatch && method === "GET") {
                        id = decodeURIComponent(contractByIdMatch[1]);
                        row = db
                            .prepare("\n        SELECT\n          c.id_contrat,\n          c.workspace_id,\n          c.dossier_id,\n          c.nif,\n          c.status,\n          c.duree_contrat,\n          c.salaire_en_chiffre,\n          c.salaire,\n          c.titre,\n          c.lieu_affectation,\n          c.annee_fiscale,\n          c.created_at,\n          c.updated_at,\n          c.deleted_at,\n          c.historique_saisie,\n          i.nom,\n          i.prenom,\n          i.sexe,\n          i.ninu,\n          i.adresse\n        FROM contrat c\n        INNER JOIN identification i ON i.nif = c.nif\n        WHERE c.id_contrat = :id\n          AND c.deleted_at IS NULL\n        LIMIT 1\n      ")
                            .get({ id: id });
                        sendJson(res, 200, row ? mapContract(row) : null);
                        return [2 /*return*/];
                    }
                    if (!(contractByIdMatch && method === "PATCH")) return [3 /*break*/, 24];
                    id = decodeURIComponent(contractByIdMatch[1]);
                    return [4 /*yield*/, parseBody(req)];
                case 23:
                    body = _r.sent();
                    current = db
                        .prepare("\n        SELECT *\n        FROM contrat\n        WHERE id_contrat = :id\n          AND deleted_at IS NULL\n        LIMIT 1\n      ")
                        .get({ id: id });
                    if (!current) {
                        throw new HttpError(404, "Contrat introuvable.");
                    }
                    nextNif = (_p = asNullableString(body.nif)) !== null && _p !== void 0 ? _p : asString(current.nif);
                    if (!nextNif) {
                        throw new HttpError(400, "Le NIF est obligatoire.");
                    }
                    linkedIdentification = db
                        .prepare("\n        SELECT nif\n        FROM identification\n        WHERE nif = :nif\n          AND deleted_at IS NULL\n        LIMIT 1\n      ")
                        .get({ nif: nextNif });
                    if (!linkedIdentification) {
                        throw new HttpError(400, "Aucune fiche identification trouvée pour ce NIF.");
                    }
                    nextStatus = body.status !== undefined ? asString(body.status) : asString(current.status);
                    if (!ALLOWED_STATUSES.has(nextStatus)) {
                        throw new HttpError(400, "Statut de contrat invalide.");
                    }
                    nextDuration = body.durationMonths !== undefined
                        ? Math.max(1, Math.min(24, asInteger(body.durationMonths, 12)))
                        : Math.max(1, Math.min(24, asInteger(current.duree_contrat, 12)));
                    nextSalaryNumber = body.salaryNumber !== undefined
                        ? asNumber(body.salaryNumber, 0)
                        : asNumber(current.salaire_en_chiffre, 0);
                    nextSalaryText = body.salaryText !== undefined
                        ? asString(body.salaryText).trim()
                        : asString(current.salaire);
                    nextTitle = body.position !== undefined
                        ? asString(body.position).trim()
                        : asString(current.titre);
                    nextAssignment = body.assignment !== undefined
                        ? asString(body.assignment).trim()
                        : asString(current.lieu_affectation);
                    if (!nextSalaryText || !nextTitle || !nextAssignment) {
                        throw new HttpError(400, "Titre, lieu d'affectation et salaire texte sont obligatoires.");
                    }
                    nextDossierId = body.dossierId !== undefined
                        ? asNullableString(body.dossierId)
                        : asNullableString(current.dossier_id);
                    timestamp = nowIso();
                    operator = operatorFromRequest(req);
                    history_2 = parseHistory(asNullableString(current.historique_saisie));
                    changes = [];
                    if (asString(current.nif) !== nextNif)
                        changes.push("nif");
                    if (asString(current.status) !== nextStatus)
                        changes.push("status");
                    if (asInteger(current.duree_contrat, 12) !== nextDuration)
                        changes.push("duree_contrat");
                    if (asNumber(current.salaire_en_chiffre, 0) !== nextSalaryNumber)
                        changes.push("salaire_en_chiffre");
                    if (asString(current.salaire) !== nextSalaryText)
                        changes.push("salaire");
                    if (asString(current.titre) !== nextTitle)
                        changes.push("titre");
                    if (asString(current.lieu_affectation) !== nextAssignment)
                        changes.push("lieu_affectation");
                    if (((_q = asNullableString(current.dossier_id)) !== null && _q !== void 0 ? _q : null) !== (nextDossierId !== null && nextDossierId !== void 0 ? nextDossierId : null))
                        changes.push("dossier_id");
                    if (changes.length > 0) {
                        history_2.updates.push({
                            updatedAt: timestamp,
                            updatedBy: operator,
                            changes: changes
                        });
                    }
                    db.prepare("\n      UPDATE contrat\n      SET nif = :nif,\n          duree_contrat = :duree_contrat,\n          salaire = :salaire,\n          salaire_en_chiffre = :salaire_en_chiffre,\n          titre = :titre,\n          lieu_affectation = :lieu_affectation,\n          historique_saisie = :historique_saisie,\n          dossier_id = :dossier_id,\n          status = :status,\n          updated_at = :updated_at\n      WHERE id_contrat = :id_contrat\n    ").run({
                        id_contrat: id,
                        nif: nextNif,
                        duree_contrat: nextDuration,
                        salaire: nextSalaryText,
                        salaire_en_chiffre: nextSalaryNumber,
                        titre: nextTitle,
                        lieu_affectation: nextAssignment,
                        historique_saisie: JSON.stringify(history_2),
                        dossier_id: nextDossierId,
                        status: nextStatus,
                        updated_at: timestamp
                    });
                    updatedRow = db
                        .prepare("\n        SELECT\n          c.id_contrat,\n          c.workspace_id,\n          c.dossier_id,\n          c.nif,\n          c.status,\n          c.duree_contrat,\n          c.salaire_en_chiffre,\n          c.salaire,\n          c.titre,\n          c.lieu_affectation,\n          c.annee_fiscale,\n          c.created_at,\n          c.updated_at,\n          c.deleted_at,\n          c.historique_saisie,\n          i.nom,\n          i.prenom,\n          i.sexe,\n          i.ninu,\n          i.adresse\n        FROM contrat c\n        INNER JOIN identification i ON i.nif = c.nif\n        WHERE c.id_contrat = :id\n        LIMIT 1\n      ")
                        .get({ id: id });
                    sendJson(res, 200, mapContract(updatedRow));
                    return [2 /*return*/];
                case 24:
                    if (!(pathname === "".concat(API_PREFIX, "/print-jobs") && method === "POST")) return [3 /*break*/, 26];
                    return [4 /*yield*/, parseBody(req)];
                case 25:
                    body = _r.sent();
                    workspaceId = asString(body.workspaceId);
                    contractIds = Array.isArray(body.contractIds)
                        ? body.contractIds.map(function (item) { return asString(item); }).filter(Boolean)
                        : [];
                    if (!workspaceId) {
                        throw new HttpError(400, "workspaceId est obligatoire.");
                    }
                    timestamp = nowIso();
                    id = randomUUID();
                    db.prepare("\n      INSERT INTO contract_print_jobs (\n        id,\n        workspace_id,\n        contract_ids_json,\n        created_at,\n        printed_at\n      ) VALUES (\n        :id,\n        :workspace_id,\n        :contract_ids_json,\n        :created_at,\n        :printed_at\n      )\n    ").run({
                        id: id,
                        workspace_id: workspaceId,
                        contract_ids_json: JSON.stringify(contractIds),
                        created_at: timestamp,
                        printed_at: timestamp
                    });
                    sendJson(res, 200, {
                        id: id,
                        workspaceId: workspaceId,
                        contractIds: contractIds,
                        createdAt: timestamp,
                        printedAt: timestamp
                    });
                    return [2 /*return*/];
                case 26:
                    if (pathname === "".concat(API_PREFIX, "/autocompletion") && method === "GET") {
                        searchParams = url.searchParams;
                        workspaceId = searchParams.get("workspaceId") || "workspace_default";
                        rows = db.prepare("SELECT * FROM autocompletion WHERE workspace_id = :workspaceId ORDER BY order_index ASC").all({ workspaceId: workspaceId });
                        result_1 = {
                            addresses: [],
                            positions: [],
                            institutions: []
                        };
                        rows.forEach(function (row) {
                            if (row.type === "address") {
                                result_1.addresses.push({ id: row.id, label: row.label, order: row.order_index });
                            }
                            else if (row.type === "position") {
                                result_1.positions.push({ id: row.id, label: row.label, defaultSalary: row.default_salary, order: row.order_index });
                            }
                            else if (row.type === "institution") {
                                var kw = [];
                                try {
                                    kw = JSON.parse(asString(row.address_keywords) || "[]");
                                }
                                catch (_a) { }
                                result_1.institutions.push({ id: row.id, label: row.label, addressKeywords: kw, order: row.order_index });
                            }
                        });
                        sendJson(res, 200, result_1);
                        return [2 /*return*/];
                    }
                    if (!(pathname === "".concat(API_PREFIX, "/autocompletion/sync") && method === "POST")) return [3 /*break*/, 28];
                    return [4 /*yield*/, parseBody(req)];
                case 27:
                    body = _r.sent();
                    workspaceId_1 = asString(body.workspaceId) || "workspace_default";
                    data = body.data;
                    if (!data || !workspaceId_1)
                        throw new HttpError(400, "Données invalides.");
                    now_1 = nowIso();
                    db.exec("BEGIN TRANSACTION;");
                    try {
                        db.prepare("DELETE FROM autocompletion WHERE workspace_id = :workspaceId").run({ workspaceId: workspaceId_1 });
                        insertAuto_2 = db.prepare("\n        INSERT INTO autocompletion (id, type, label, default_salary, address_keywords, order_index, workspace_id, created_at, updated_at)\n        VALUES (:id, :type, :label, :default_salary, :address_keywords, :order_index, :workspace_id, :created_at, :updated_at)\n      ");
                        if (Array.isArray(data.addresses)) {
                            data.addresses.forEach(function (a, idx) {
                                insertAuto_2.run({ id: a.id || randomUUID(), type: "address", label: a.label, default_salary: null, address_keywords: null, order_index: typeof a.order === 'number' ? a.order : idx, workspace_id: workspaceId_1, created_at: now_1, updated_at: now_1 });
                            });
                        }
                        if (Array.isArray(data.positions)) {
                            data.positions.forEach(function (p, idx) {
                                insertAuto_2.run({ id: p.id || randomUUID(), type: "position", label: p.label, default_salary: p.defaultSalary || 0, address_keywords: null, order_index: typeof p.order === 'number' ? p.order : idx, workspace_id: workspaceId_1, created_at: now_1, updated_at: now_1 });
                            });
                        }
                        if (Array.isArray(data.institutions)) {
                            data.institutions.forEach(function (i, idx) {
                                insertAuto_2.run({ id: i.id || randomUUID(), type: "institution", label: i.label, default_salary: null, address_keywords: JSON.stringify(i.addressKeywords || []), order_index: typeof i.order === 'number' ? i.order : idx, workspace_id: workspaceId_1, created_at: now_1, updated_at: now_1 });
                            });
                        }
                        db.exec("COMMIT;");
                        sendJson(res, 200, { ok: true });
                    }
                    catch (err) {
                        db.exec("ROLLBACK;");
                        throw new HttpError(500, "Erreur de sync autocompletion." + err.message);
                    }
                    return [2 /*return*/];
                case 28:
                    if (!(pathname === "".concat(API_PREFIX, "/mspp/verify") && method === "GET")) return [3 /*break*/, 34];
                    searchParams = url.searchParams;
                    nifParam = searchParams.get("nif");
                    if (!nifParam) {
                        res.statusCode = 400;
                        res.setHeader("Content-Type", "text/html; charset=utf-8");
                        res.end("<p style='font-family:sans-serif;padding:20px;color:red'>Le NIF est obligatoire.</p>");
                        return [2 /*return*/];
                    }
                    _r.label = 29;
                case 29:
                    _r.trys.push([29, 32, , 33]);
                    rawNif = nifParam.replace(/\D/g, "");
                    nifFormatted = rawNif;
                    if (rawNif.length === 10) {
                        nifFormatted = rawNif.replace(/(\d{3})(\d{3})(\d{3})(\d{1})/, "$1-$2-$3-$4");
                    }
                    msppUrl = "https://mspp.gouv.ht/verification-permis";
                    formData = new URLSearchParams();
                    formData.append("nif", nifFormatted);
                    return [4 /*yield*/, fetch(msppUrl, {
                            method: "POST",
                            body: formData,
                            headers: {
                                "Content-Type": "application/x-www-form-urlencoded",
                                "User-Agent": "Mozilla/5.0 (compatible)"
                            }
                        })];
                case 30:
                    msppRes = _r.sent();
                    return [4 /*yield*/, msppRes.text()];
                case 31:
                    html = _r.sent();
                    // Convert relative URLs to absolute URLs so CSS and images load correctly
                    html = html.replace(/href="\/(?!\/)/g, 'href="https://mspp.gouv.ht/');
                    html = html.replace(/src="\/(?!\/)/g, 'src="https://mspp.gouv.ht/');
                    // Rewrite the form to stay inside our iframe via GET, so user can re-search and see new results
                    html = html.replace(/<form method="post" action="https:\/\/mspp\.gouv\.ht\/verification-permis"/i, '<form method="get" action="/api/local/mspp/verify"');
                    // In case the replacement above didn't catch it due to spacing
                    html = html.replace(/action="https:\/\/mspp\.gouv\.ht\/verification-permis"/i, 'action="/api/local/mspp/verify"');
                    html = html.replace(/method="post"[^>]*action="\/api\/local\/mspp\/verify"/i, 'method="get" action="/api/local/mspp/verify"');
                    // Pre-fill the input
                    html = html.replace('id="nif"', "id=\"nif\" value=\"".concat(nifFormatted, "\""));
                    injectedStyle = "\n      <style>\n        .site-header, \n        .site-footer, \n        #toolbar-administration,\n        /* Try to hide any other top navs if any */\n        header, footer {\n          display: none !important;\n        }\n        body {\n          padding-top: 0 !important;\n          margin-top: 0 !important;\n          background-color: transparent !important;\n        }\n        .main-container {\n          padding-top: 20px !important;\n        }\n      </style>\n      </head>\n      ";
                    html = html.replace('</head>', injectedStyle);
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.setHeader("Cache-Control", "no-store");
                    res.end(html);
                    return [3 /*break*/, 33];
                case 32:
                    err_1 = _r.sent();
                    res.statusCode = 500;
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.end("<p style='font-family:sans-serif;padding:20px;color:red'>Erreur de connexion au site du MSPP : ".concat(err_1.message, "</p>"));
                    return [3 /*break*/, 33];
                case 33: return [2 /*return*/];
                case 34: throw new HttpError(404, "Route API locale introuvable.");
            }
        });
    });
}
function createLocalSqliteMiddleware() {
    return function (req, res, next) {
        var _a;
        var url = new URL((_a = req.url) !== null && _a !== void 0 ? _a : "/", "http://localhost");
        if (!url.pathname.startsWith(API_PREFIX)) {
            next();
            return;
        }
        void handleApiRequest(req, res).catch(function (error) {
            respondError(res, error);
        });
    };
}
export function localSqliteApiPlugin() {
    var middleware = createLocalSqliteMiddleware();
    return {
        name: "local-sqlite-api",
        configureServer: function (server) {
            server.middlewares.use(middleware);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(middleware);
        }
    };
}
