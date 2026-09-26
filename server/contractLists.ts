import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type Row = Record<string, any>;
export function initializeContractLists(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_lists (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      duration_months INTEGER NOT NULL CHECK(duration_months BETWEEN 1 AND 12),
      visa_number TEXT, sealed_at TEXT, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, history TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS contract_lists_workspace_idx ON contract_lists(workspace_id);
    CREATE TABLE IF NOT EXISTS contract_list_members (
      contract_id TEXT PRIMARY KEY REFERENCES contrat(id_contrat),
      list_id TEXT NOT NULL REFERENCES contract_lists(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS contract_list_members_list_idx ON contract_list_members(list_id);
    CREATE TRIGGER IF NOT EXISTS list_contract_update BEFORE UPDATE ON contrat
    WHEN EXISTS(SELECT 1 FROM contract_list_members WHERE contract_id=OLD.id_contrat)
    BEGIN
      SELECT CASE WHEN EXISTS(
        SELECT 1 FROM contract_list_members m JOIN contract_lists l ON l.id=m.list_id
        WHERE m.contract_id=OLD.id_contrat AND (
          NEW.workspace_id IS NOT OLD.workspace_id OR NEW.id_contrat IS NOT OLD.id_contrat OR
          NEW.duree_contrat IS NOT l.duration_months OR
          (l.sealed_at IS NOT NULL AND (
            NEW.deleted_at IS NOT OLD.deleted_at OR NEW.nif IS NOT OLD.nif OR
            NEW.salaire_en_chiffre IS NOT OLD.salaire_en_chiffre OR
            NEW.titre IS NOT OLD.titre OR NEW.lieu_affectation IS NOT OLD.lieu_affectation OR
            NEW.annee_fiscale IS NOT OLD.annee_fiscale
          ))
        )
      ) THEN RAISE(ABORT, 'Retirez le contrat de sa liste ou faites rouvrir la liste scellée avant cette modification.') END;
    END;
    CREATE TRIGGER IF NOT EXISTS list_contract_deleted AFTER UPDATE OF deleted_at ON contrat
    WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
    BEGIN
      DELETE FROM contract_list_members WHERE contract_id=NEW.id_contrat;
    END;
    CREATE TRIGGER IF NOT EXISTS list_identity_update BEFORE UPDATE ON identification
    WHEN (NEW.nom IS NOT OLD.nom OR NEW.prenom IS NOT OLD.prenom OR NEW.nif IS NOT OLD.nif OR
          NEW.sexe IS NOT OLD.sexe OR NEW.adresse IS NOT OLD.adresse OR NEW.ninu IS NOT OLD.ninu OR NEW.deleted_at IS NOT OLD.deleted_at)
    AND EXISTS(SELECT 1 FROM contrat c JOIN contract_list_members m ON m.contract_id=c.id_contrat
      JOIN contract_lists l ON l.id=m.list_id WHERE c.nif=OLD.nif AND l.sealed_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'Cette personne appartient à une liste scellée. Faites rouvrir la liste avant de modifier son identité.'); END;
    CREATE TRIGGER IF NOT EXISTS list_member_insert BEFORE INSERT ON contract_list_members
    BEGIN
      SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM contrat c JOIN contract_lists l ON l.id=NEW.list_id
        WHERE c.id_contrat=NEW.contract_id AND c.deleted_at IS NULL AND c.workspace_id=l.workspace_id
        AND c.duree_contrat=l.duration_months AND l.sealed_at IS NULL)
        THEN RAISE(ABORT, 'Contrat incompatible ou liste scellée.') END;
    END;
    CREATE TRIGGER IF NOT EXISTS list_member_delete BEFORE DELETE ON contract_list_members
    WHEN EXISTS(SELECT 1 FROM contract_lists WHERE id=OLD.list_id AND sealed_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'Faites rouvrir la liste scellée avant de retirer ce contrat.'); END;
    CREATE TRIGGER IF NOT EXISTS list_member_no_update BEFORE UPDATE ON contract_list_members
    BEGIN SELECT RAISE(ABORT, 'Utilisez le déplacement de contrat.'); END;
    CREATE TRIGGER IF NOT EXISTS list_member_added AFTER INSERT ON contract_list_members
    BEGIN UPDATE contract_lists SET version=version+1 WHERE id=NEW.list_id; END;
    CREATE TRIGGER IF NOT EXISTS list_member_removed AFTER DELETE ON contract_list_members
    BEGIN UPDATE contract_lists SET version=version+1 WHERE id=OLD.list_id; END;
    CREATE TRIGGER IF NOT EXISTS list_contract_version AFTER UPDATE ON contrat
    BEGIN UPDATE contract_lists SET version=version+1 WHERE id IN (SELECT list_id FROM contract_list_members WHERE contract_id=NEW.id_contrat); END;
    CREATE TRIGGER IF NOT EXISTS list_identity_version AFTER UPDATE ON identification
    BEGIN UPDATE contract_lists SET version=version+1 WHERE id IN
      (SELECT m.list_id FROM contract_list_members m JOIN contrat c ON c.id_contrat=m.contract_id WHERE c.nif=NEW.nif); END;
  `);
}

export function readContractLists(db: DatabaseSync, workspaceId: string) {
  const lists = db.prepare("SELECT * FROM contract_lists WHERE workspace_id=? ORDER BY created_at DESC, id").all(workspaceId) as Row[];
  const members = db.prepare(`SELECT m.list_id, c.id_contrat AS id, i.nom AS lastName, i.prenom AS firstName,
    c.nif, c.titre AS position, c.salaire_en_chiffre AS salaryNumber, c.duree_contrat AS durationMonths
    FROM contract_list_members m JOIN contrat c ON c.id_contrat=m.contract_id
    JOIN identification i ON i.nif=c.nif WHERE c.workspace_id=? AND c.deleted_at IS NULL`).all(workspaceId) as Row[];
  return lists.map(l => ({ id: l.id, workspaceId: l.workspace_id, durationMonths: l.duration_months,
    visaNumber: l.visa_number, sealedAt: l.sealed_at, version: l.version, createdAt: l.created_at,
    history: JSON.parse(l.history), members: members.filter(m => m.list_id === l.id).map(({ list_id, ...m }) => m) }));
}

export function mutateContractList(db: DatabaseSync, workspaceId: string, input: Row, actor: { name: string; role?: string | null }) {
  if (!["admin", "agent", "controller"].includes(actor.role ?? "")) throw new Error("Vous n’avez pas le droit de modifier les listes.");
  if (!workspaceId) throw new Error("Espace de travail requis.");
  if (String(input.visaNumber ?? "").trim().length > 120) throw new Error("Le numéro de visa est limité à 120 caractères.");
  const at = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    let id = input.listId ?? null;
    let list = id ? db.prepare("SELECT * FROM contract_lists WHERE id=? AND workspace_id=?").get(id, workspaceId) as Row | undefined : undefined;
    if (id && !list) throw new Error("Liste introuvable.");
    const event = { at, actor: actor.name, action: input.action, reason: input.reason?.trim() };
    const record = (targetId: string, entry = event) => {
      const row = db.prepare("SELECT history FROM contract_lists WHERE id=?").get(targetId) as Row;
      db.prepare("UPDATE contract_lists SET history=?, version=version+1 WHERE id=?").run(JSON.stringify([...JSON.parse(row.history), entry]), targetId);
    };
    if (input.action === "create") {
      if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 12) throw new Error("La durée doit être comprise entre 1 et 12 mois.");
      id = randomUUID();
      db.prepare("INSERT INTO contract_lists(id,workspace_id,duration_months,visa_number,created_at,history) VALUES(?,?,?,?,?,?)")
        .run(id, workspaceId, input.durationMonths, String(input.visaNumber ?? "").trim() || null, at, JSON.stringify([event]));
      list = db.prepare("SELECT * FROM contract_lists WHERE id=?").get(id) as Row;
    }
    if (input.action === "assign" || (input.action === "create" && input.contractIds !== undefined)) {
      const ids = Array.from(new Set(input.contractIds as string[] ?? []));
      if (!ids.length) throw new Error("Sélectionnez au moins un contrat.");
      if (list?.sealed_at) throw new Error("Faites rouvrir la liste scellée avant de la modifier.");
      const changedLists = new Set<string>();
      for (const contractId of ids) {
        const contract = db.prepare("SELECT * FROM contrat WHERE id_contrat=? AND workspace_id=? AND deleted_at IS NULL").get(contractId, workspaceId) as Row | undefined;
        if (!contract) throw new Error("Un contrat est introuvable. Actualisez la page.");
        if (list && contract.duree_contrat !== list.duration_months) throw new Error("Tous les contrats d’une liste doivent avoir la même durée.");
        const old = db.prepare("SELECT list_id FROM contract_list_members WHERE contract_id=?").get(contractId) as Row | undefined;
        if (old?.list_id === id) continue;
        if (old) { db.prepare("DELETE FROM contract_list_members WHERE contract_id=?").run(contractId); changedLists.add(old.list_id); }
        if (id) { db.prepare("INSERT INTO contract_list_members(contract_id,list_id) VALUES(?,?)").run(contractId, id); changedLists.add(id); }
      }
      for (const changed of Array.from(changedLists)) record(changed, { ...event, action: "assign", reason: `${ids.length} contrat(s) · destination : ${id ?? 'sans liste'}` });
    } else if (input.action !== "create") {
      if (!list) throw new Error("Liste introuvable.");
      if (list.version !== input.version) throw new Error("La liste a changé. Actualisez-la avant de continuer.");
      if (input.action === "reopen") {
        if (actor.role !== "admin") throw new Error("Seul un administrateur peut rouvrir une liste.");
        if (!list.sealed_at || !input.reason?.trim()) throw new Error("Indiquez le motif de réouverture.");
        db.prepare("UPDATE contract_lists SET sealed_at=NULL WHERE id=?").run(id);
      } else {
        if (list.sealed_at) throw new Error("Faites rouvrir la liste scellée avant de la modifier.");
        if (input.action === "visa") {
          const visa = String(input.visaNumber ?? "").trim();
          if (visa.length > 120) throw new Error("Le numéro de visa est limité à 120 caractères.");
          db.prepare("UPDATE contract_lists SET visa_number=? WHERE id=?").run(visa || null, id);
        } else if (input.action === "seal") {
          if (!(db.prepare("SELECT 1 FROM contract_list_members WHERE list_id=?").get(id))) throw new Error("Une liste vide ne peut pas être scellée.");
          db.prepare("UPDATE contract_lists SET sealed_at=? WHERE id=?").run(at, id);
        } else if (input.action === "delete") {
          if (db.prepare("SELECT 1 FROM contract_list_members WHERE list_id=?").get(id)) throw new Error("Retirez les contrats avant de supprimer la liste.");
          db.prepare("DELETE FROM contract_lists WHERE id=?").run(id);
        } else throw new Error("Action inconnue.");
      }
      if (input.action !== "delete") record(id);
    }
    db.exec("COMMIT");
    return id;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
