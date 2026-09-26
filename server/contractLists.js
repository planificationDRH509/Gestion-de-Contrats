var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
import { randomUUID } from "node:crypto";
export function initializeContractLists(db) {
    db.exec("\n    CREATE TABLE IF NOT EXISTS contract_lists (\n      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),\n      duration_months INTEGER NOT NULL CHECK(duration_months BETWEEN 1 AND 12),\n      visa_number TEXT, sealed_at TEXT, version INTEGER NOT NULL DEFAULT 1,\n      created_at TEXT NOT NULL, history TEXT NOT NULL DEFAULT '[]'\n    );\n    CREATE INDEX IF NOT EXISTS contract_lists_workspace_idx ON contract_lists(workspace_id);\n    CREATE TABLE IF NOT EXISTS contract_list_members (\n      contract_id TEXT PRIMARY KEY REFERENCES contrat(id_contrat),\n      list_id TEXT NOT NULL REFERENCES contract_lists(id) ON DELETE RESTRICT\n    );\n    CREATE INDEX IF NOT EXISTS contract_list_members_list_idx ON contract_list_members(list_id);\n    CREATE TRIGGER IF NOT EXISTS list_contract_update BEFORE UPDATE ON contrat\n    WHEN EXISTS(SELECT 1 FROM contract_list_members WHERE contract_id=OLD.id_contrat)\n    BEGIN\n      SELECT CASE WHEN EXISTS(\n        SELECT 1 FROM contract_list_members m JOIN contract_lists l ON l.id=m.list_id\n        WHERE m.contract_id=OLD.id_contrat AND (\n          NEW.workspace_id IS NOT OLD.workspace_id OR NEW.id_contrat IS NOT OLD.id_contrat OR\n          NEW.duree_contrat IS NOT l.duration_months OR\n          (l.sealed_at IS NOT NULL AND (\n            NEW.deleted_at IS NOT OLD.deleted_at OR NEW.nif IS NOT OLD.nif OR\n            NEW.salaire_en_chiffre IS NOT OLD.salaire_en_chiffre OR\n            NEW.titre IS NOT OLD.titre OR NEW.lieu_affectation IS NOT OLD.lieu_affectation OR\n            NEW.annee_fiscale IS NOT OLD.annee_fiscale\n          ))\n        )\n      ) THEN RAISE(ABORT, 'Retirez le contrat de sa liste ou faites rouvrir la liste scell\u00E9e avant cette modification.') END;\n    END;\n    CREATE TRIGGER IF NOT EXISTS list_contract_deleted AFTER UPDATE OF deleted_at ON contrat\n    WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL\n    BEGIN\n      DELETE FROM contract_list_members WHERE contract_id=NEW.id_contrat;\n    END;\n    CREATE TRIGGER IF NOT EXISTS list_identity_update BEFORE UPDATE ON identification\n    WHEN (NEW.nom IS NOT OLD.nom OR NEW.prenom IS NOT OLD.prenom OR NEW.nif IS NOT OLD.nif OR\n          NEW.sexe IS NOT OLD.sexe OR NEW.adresse IS NOT OLD.adresse OR NEW.ninu IS NOT OLD.ninu OR NEW.deleted_at IS NOT OLD.deleted_at)\n    AND EXISTS(SELECT 1 FROM contrat c JOIN contract_list_members m ON m.contract_id=c.id_contrat\n      JOIN contract_lists l ON l.id=m.list_id WHERE c.nif=OLD.nif AND l.sealed_at IS NOT NULL)\n    BEGIN SELECT RAISE(ABORT, 'Cette personne appartient \u00E0 une liste scell\u00E9e. Faites rouvrir la liste avant de modifier son identit\u00E9.'); END;\n    CREATE TRIGGER IF NOT EXISTS list_member_insert BEFORE INSERT ON contract_list_members\n    BEGIN\n      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM contrat c JOIN contract_lists l ON l.id=NEW.list_id\n        WHERE c.id_contrat=NEW.contract_id AND c.deleted_at IS NULL AND c.workspace_id=l.workspace_id\n        AND c.duree_contrat=l.duration_months AND l.sealed_at IS NULL)\n        THEN RAISE(ABORT, 'Contrat incompatible ou liste scell\u00E9e.') END;\n    END;\n    CREATE TRIGGER IF NOT EXISTS list_member_delete BEFORE DELETE ON contract_list_members\n    WHEN EXISTS(SELECT 1 FROM contract_lists WHERE id=OLD.list_id AND sealed_at IS NOT NULL)\n    BEGIN SELECT RAISE(ABORT, 'Faites rouvrir la liste scell\u00E9e avant de retirer ce contrat.'); END;\n    CREATE TRIGGER IF NOT EXISTS list_member_no_update BEFORE UPDATE ON contract_list_members\n    BEGIN SELECT RAISE(ABORT, 'Utilisez le d\u00E9placement de contrat.'); END;\n    CREATE TRIGGER IF NOT EXISTS list_member_added AFTER INSERT ON contract_list_members\n    BEGIN UPDATE contract_lists SET version=version+1 WHERE id=NEW.list_id; END;\n    CREATE TRIGGER IF NOT EXISTS list_member_removed AFTER DELETE ON contract_list_members\n    BEGIN UPDATE contract_lists SET version=version+1 WHERE id=OLD.list_id; END;\n    CREATE TRIGGER IF NOT EXISTS list_contract_version AFTER UPDATE ON contrat\n    BEGIN UPDATE contract_lists SET version=version+1 WHERE id IN (SELECT list_id FROM contract_list_members WHERE contract_id=NEW.id_contrat); END;\n    CREATE TRIGGER IF NOT EXISTS list_identity_version AFTER UPDATE ON identification\n    BEGIN UPDATE contract_lists SET version=version+1 WHERE id IN\n      (SELECT m.list_id FROM contract_list_members m JOIN contrat c ON c.id_contrat=m.contract_id WHERE c.nif=NEW.nif); END;\n  ");
}
export function readContractLists(db, workspaceId) {
    var lists = db.prepare("SELECT * FROM contract_lists WHERE workspace_id=? ORDER BY created_at DESC, id").all(workspaceId);
    var members = db.prepare("SELECT m.list_id, c.id_contrat AS id, i.nom AS lastName, i.prenom AS firstName,\n    c.nif, c.titre AS position, c.salaire_en_chiffre AS salaryNumber, c.duree_contrat AS durationMonths\n    FROM contract_list_members m JOIN contrat c ON c.id_contrat=m.contract_id\n    JOIN identification i ON i.nif=c.nif WHERE c.workspace_id=? AND c.deleted_at IS NULL").all(workspaceId);
    return lists.map(function (l) { return ({ id: l.id, workspaceId: l.workspace_id, durationMonths: l.duration_months,
        visaNumber: l.visa_number, sealedAt: l.sealed_at, version: l.version, createdAt: l.created_at,
        history: JSON.parse(l.history), members: members.filter(function (m) { return m.list_id === l.id; }).map(function (_a) {
            var list_id = _a.list_id, m = __rest(_a, ["list_id"]);
            return m;
        }) }); });
}
export function mutateContractList(db, workspaceId, input, actor) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!["admin", "agent", "controller"].includes((_a = actor.role) !== null && _a !== void 0 ? _a : ""))
        throw new Error("Vous n’avez pas le droit de modifier les listes.");
    if (!workspaceId)
        throw new Error("Espace de travail requis.");
    if (String((_b = input.visaNumber) !== null && _b !== void 0 ? _b : "").trim().length > 120)
        throw new Error("Le numéro de visa est limité à 120 caractères.");
    var at = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
        var id = (_c = input.listId) !== null && _c !== void 0 ? _c : null;
        var list = id ? db.prepare("SELECT * FROM contract_lists WHERE id=? AND workspace_id=?").get(id, workspaceId) : undefined;
        if (id && !list)
            throw new Error("Liste introuvable.");
        var event_1 = { at: at, actor: actor.name, action: input.action, reason: (_d = input.reason) === null || _d === void 0 ? void 0 : _d.trim() };
        var record = function (targetId, entry) {
            if (entry === void 0) { entry = event_1; }
            var row = db.prepare("SELECT history FROM contract_lists WHERE id=?").get(targetId);
            db.prepare("UPDATE contract_lists SET history=?, version=version+1 WHERE id=?").run(JSON.stringify(__spreadArray(__spreadArray([], JSON.parse(row.history), true), [entry], false)), targetId);
        };
        if (input.action === "create") {
            if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 12)
                throw new Error("La durée doit être comprise entre 1 et 12 mois.");
            id = randomUUID();
            db.prepare("INSERT INTO contract_lists(id,workspace_id,duration_months,visa_number,created_at,history) VALUES(?,?,?,?,?,?)")
                .run(id, workspaceId, input.durationMonths, String((_e = input.visaNumber) !== null && _e !== void 0 ? _e : "").trim() || null, at, JSON.stringify([event_1]));
            list = db.prepare("SELECT * FROM contract_lists WHERE id=?").get(id);
        }
        if (input.action === "assign" || (input.action === "create" && input.contractIds !== undefined)) {
            var ids = Array.from(new Set((_f = input.contractIds) !== null && _f !== void 0 ? _f : []));
            if (!ids.length)
                throw new Error("Sélectionnez au moins un contrat.");
            if (list === null || list === void 0 ? void 0 : list.sealed_at)
                throw new Error("Faites rouvrir la liste scellée avant de la modifier.");
            var changedLists = new Set();
            for (var _i = 0, ids_1 = ids; _i < ids_1.length; _i++) {
                var contractId = ids_1[_i];
                var contract = db.prepare("SELECT * FROM contrat WHERE id_contrat=? AND workspace_id=? AND deleted_at IS NULL").get(contractId, workspaceId);
                if (!contract)
                    throw new Error("Un contrat est introuvable. Actualisez la page.");
                if (list && contract.duree_contrat !== list.duration_months)
                    throw new Error("Tous les contrats d’une liste doivent avoir la même durée.");
                var old = db.prepare("SELECT list_id FROM contract_list_members WHERE contract_id=?").get(contractId);
                if ((old === null || old === void 0 ? void 0 : old.list_id) === id)
                    continue;
                if (old) {
                    db.prepare("DELETE FROM contract_list_members WHERE contract_id=?").run(contractId);
                    changedLists.add(old.list_id);
                }
                if (id) {
                    db.prepare("INSERT INTO contract_list_members(contract_id,list_id) VALUES(?,?)").run(contractId, id);
                    changedLists.add(id);
                }
            }
            for (var _j = 0, _k = Array.from(changedLists); _j < _k.length; _j++) {
                var changed = _k[_j];
                record(changed, __assign(__assign({}, event_1), { action: "assign", reason: "".concat(ids.length, " contrat(s) \u00B7 destination : ").concat(id !== null && id !== void 0 ? id : 'sans liste') }));
            }
        }
        else if (input.action !== "create") {
            if (!list)
                throw new Error("Liste introuvable.");
            if (list.version !== input.version)
                throw new Error("La liste a changé. Actualisez-la avant de continuer.");
            if (input.action === "reopen") {
                if (actor.role !== "admin")
                    throw new Error("Seul un administrateur peut rouvrir une liste.");
                if (!list.sealed_at || !((_g = input.reason) === null || _g === void 0 ? void 0 : _g.trim()))
                    throw new Error("Indiquez le motif de réouverture.");
                db.prepare("UPDATE contract_lists SET sealed_at=NULL WHERE id=?").run(id);
            }
            else {
                if (list.sealed_at)
                    throw new Error("Faites rouvrir la liste scellée avant de la modifier.");
                if (input.action === "visa") {
                    var visa = String((_h = input.visaNumber) !== null && _h !== void 0 ? _h : "").trim();
                    if (visa.length > 120)
                        throw new Error("Le numéro de visa est limité à 120 caractères.");
                    db.prepare("UPDATE contract_lists SET visa_number=? WHERE id=?").run(visa || null, id);
                }
                else if (input.action === "seal") {
                    if (!(db.prepare("SELECT 1 FROM contract_list_members WHERE list_id=?").get(id)))
                        throw new Error("Une liste vide ne peut pas être scellée.");
                    db.prepare("UPDATE contract_lists SET sealed_at=? WHERE id=?").run(at, id);
                }
                else if (input.action === "delete") {
                    if (db.prepare("SELECT 1 FROM contract_list_members WHERE list_id=?").get(id))
                        throw new Error("Retirez les contrats avant de supprimer la liste.");
                    db.prepare("DELETE FROM contract_lists WHERE id=?").run(id);
                }
                else
                    throw new Error("Action inconnue.");
            }
            if (input.action !== "delete")
                record(id);
        }
        db.exec("COMMIT");
        return id;
    }
    catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}
