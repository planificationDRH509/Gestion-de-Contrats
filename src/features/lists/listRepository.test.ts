import { createRequire } from "node:module";
import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeContractLists, mutateContractList, readContractLists } from "../../../server/contractLists";
import { listName, listTotals, sortedMembers, type ContractList } from "./listModel";

let db: SqliteDatabase;
const admin = { name: "Test Admin", role: "admin" };
const agent = { name: "Test Agent", role: "agent" };
const act = (input: Record<string, unknown>, actor = admin, workspace = "w") => mutateContractList(db, workspace, input, actor);
const get = (id: string): ContractList => readContractLists(db, "w").find(l => l.id === id) as ContractList;
const create = (durationMonths = 6) => act({ action: "create", durationMonths }) as string;
const assign = (listId: string | null, contractIds: string[]) => act({ action: "assign", listId, contractIds });
const seal = (id: string) => act({ action: "seal", listId: id, version: get(id).version });
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces(id TEXT PRIMARY KEY);
    INSERT INTO workspaces VALUES('w'),('other');
    CREATE TABLE identification(nif TEXT PRIMARY KEY, nom TEXT, prenom TEXT, sexe TEXT, adresse TEXT, ninu TEXT, deleted_at TEXT);
    INSERT INTO identification VALUES('n1','LOUIS','Louvens','Homme','A',NULL,NULL),('n2','ÉTIENNE','Ana','Femme','B',NULL,NULL),('n3','ZÉPHIR','Luc','Homme','C',NULL,NULL);
    CREATE TABLE contrat(id_contrat TEXT PRIMARY KEY,workspace_id TEXT, nif TEXT REFERENCES identification(nif), duree_contrat INTEGER, salaire_en_chiffre REAL,salaire TEXT,titre TEXT,lieu_affectation TEXT,annee_fiscale TEXT, deleted_at TEXT, status TEXT);
    INSERT INTO contrat VALUES('c1','w','n1',6,100.10,'Cent','Poste','Lieu','2025-2026',NULL,'saisie'),('c2','w','n2',6,200.20,'Deux cents','Poste','Lieu','2025-2026',NULL,'saisie'),('c3','w','n3',12,300,'Trois cents','Poste','Lieu','2025-2026',NULL,'saisie');
  `);
  initializeContractLists(db);
});
afterEach(() => db.close());
describe("contract lists", () => {
  it("creates and populates a lot atomically from the selection", () => {
    const source=create(); assign(source,['c1']);
    const id=act({action:'create',durationMonths:6,visaNumber:'V-NEW',contractIds:['c1','c2']}) as string;
    expect(get(id).members).toHaveLength(2); expect(get(id).visaNumber).toBe('V-NEW');
    expect(get(source).members).toHaveLength(0);
    expect(get(id).history.map(h=>h.action)).toEqual(['create','assign']);
  });
  it("leaves neither an empty lot nor partial moves when creation contains incompatible contracts", () => {
    const source=create(); assign(source,['c1']);
    expect(()=>act({action:'create',durationMonths:6,contractIds:['c1','c3']})).toThrow(/même durée/);
    expect(readContractLists(db,'w')).toHaveLength(1); expect(get(source).members).toHaveLength(1);
    seal(source);
    expect(()=>act({action:'create',durationMonths:6,contractIds:['c2','c1']})).toThrow(/scellée/);
    expect(readContractLists(db,'w')).toHaveLength(1);
    expect(()=>act({action:'create',durationMonths:6,contractIds:[]})).toThrow(/Sélectionnez/);
    expect(readContractLists(db,'w')).toHaveLength(1);
  });
  it("names lots alphabetically and computes monthly and full-duration amounts without decimal drift", () => {
    const id = create(); assign(id, ['c1','c2']); const list = get(id);
    expect(listName(list)).toBe('LOT-2-ÉTIENNE-Ana');
    expect(sortedMembers(list.members).map(m => m.id)).toEqual(['c2','c1']);
    expect(listTotals(list)).toEqual({ monthly: 300.3, total: 1801.8 });
    expect(list.members.map(m => m.id)).toEqual(['c1','c2']);
  });
  it("moves contracts exclusively and updates both lots", () => {
    const a = create(), b = create(); assign(a,['c1','c2']); assign(b,['c2']);
    expect(listName(get(a))).toBe('LOT-1-LOUIS-Louvens');
    expect(get(b).members.map(m => m.id)).toEqual(['c2']);
    assign(null,['c2']); expect(get(b).members).toHaveLength(0);
  });
  it("rolls back a whole batch on incompatible duration", () => {
    const a = create(), b = create(); assign(a,['c1']);
    expect(() => assign(b,['c1','c3'])).toThrow(/même durée/);
    expect(get(a).members).toHaveLength(1); expect(get(b).members).toHaveLength(0);
  });
  it("does not allow empty sealing or deletion of a populated list", () => {
    const id = create(); expect(() => seal(id)).toThrow(/vide/); assign(id,['c1']);
    expect(() => act({ action:'delete',listId:id,version:get(id).version })).toThrow(/Retirez/);
  });
  it("protects sealed source and destination and requires an administrator and reason to reopen", () => {
    const a = create(), b = create(); assign(a,['c1']); seal(a);
    expect(() => assign(b,['c1'])).toThrow(/scellée/);
    expect(() => assign(a,['c2'])).toThrow(/scellée/);
    expect(() => assign(null,['c1'])).toThrow(/scellée/);
    const reopen = {action:'reopen',listId:a,version:get(a).version,reason:'Correction demandée'};
    expect(() => act(reopen,agent)).toThrow(/administrateur/);
    expect(() => act({...reopen,reason:' '})).toThrow(/motif/);
    act(reopen); assign(b,['c1']);
    expect(get(a).history.some(h => h.action === 'reopen' && h.reason === 'Correction demandée')).toBe(true);
  });
  it("blocks identity, amount, duration and deletion edits to sealed contracts while allowing workflow status", () => {
    const id=create(); assign(id,['c1']); seal(id);
    expect(() => db.prepare("UPDATE contrat SET salaire_en_chiffre=999 WHERE id_contrat='c1'").run()).toThrow(/scellée/);
    expect(() => db.prepare("UPDATE contrat SET deleted_at='today' WHERE id_contrat='c1'").run()).toThrow(/scellée/);
    expect(() => db.prepare("UPDATE contrat SET duree_contrat=12 WHERE id_contrat='c1'").run()).toThrow();
    expect(() => db.prepare("UPDATE identification SET nom='NOUVEAU' WHERE nif='n1'").run()).toThrow(/scellée/);
    expect(() => db.prepare("DELETE FROM contrat WHERE id_contrat='c1'").run()).toThrow();
    db.prepare("UPDATE contrat SET status='transfere' WHERE id_contrat='c1'").run();
    expect(get(id).members).toHaveLength(1);
  });
  it("rejects duration edits within an open lot and removes soft-deleted open contracts", () => {
    const id=create(); assign(id,['c1']);
    expect(() => db.prepare("UPDATE contrat SET duree_contrat=12 WHERE id_contrat='c1'").run()).toThrow();
    db.prepare("UPDATE contrat SET deleted_at='today' WHERE id_contrat='c1'").run();
    expect(get(id).members).toHaveLength(0);
  });
  it("checks permissions, workspace and unknown contracts", () => {
    expect(() => act({action:'create',durationMonths:6},{name:'Reader',role:'reader'})).toThrow(/droit/);
    const id=create(); expect(() => act({action:'assign',listId:id,contractIds:['c1']},admin,'other')).toThrow(/introuvable/);
    expect(() => assign(id,['c1','missing'])).toThrow(/introuvable/); expect(get(id).members).toHaveLength(0);
  });
  it("rejects stale confirmations after another user changes the contents", () => {
    const id=create(); const version=get(id).version; assign(id,['c1']);
    expect(() => act({action:'seal',listId:id,version})).toThrow(/changé/);
    const fresh=get(id).version; db.prepare("UPDATE contrat SET salaire_en_chiffre=123 WHERE id_contrat='c1'").run();
    expect(() => act({action:'seal',listId:id,version:fresh})).toThrow(/changé/);
  });
  it("supports optional visa and protects it after sealing", () => {
    const id=create(); act({action:'visa',listId:id,version:get(id).version,visaNumber:' V-2026 '});
    expect(get(id).visaNumber).toBe('V-2026'); assign(id,['c1']); seal(id);
    expect(() => act({action:'visa',listId:id,version:get(id).version,visaNumber:'other'})).toThrow(/scellée/);
  });
  it("enforces invariants even with direct membership writes", () => {
    const id=create();
    expect(() => db.prepare('INSERT INTO contract_list_members VALUES(?,?)').run('c3',id)).toThrow(/incompatible/);
    assign(id,['c1']); seal(id);
    expect(() => db.prepare('DELETE FROM contract_list_members WHERE contract_id=?').run('c1')).toThrow(/scellée/);
  });
});
