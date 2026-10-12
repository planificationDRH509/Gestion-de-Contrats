import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { migrateListedStatus } from "../../../server/listedStatusMigration";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

it("upgrades an existing status constraint and preserves references, indexes and triggers", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE contrat(id_contrat TEXT PRIMARY KEY, status TEXT CHECK(status IN ('saisie','signe')));
      CREATE INDEX status_index ON contrat(status);
      CREATE TABLE history(value TEXT);
      CREATE TRIGGER contract_history AFTER UPDATE ON contrat BEGIN INSERT INTO history VALUES(NEW.status); END;
      CREATE TABLE members(contract_id TEXT REFERENCES contrat(id_contrat));
      INSERT INTO contrat VALUES('c1','saisie'); INSERT INTO members VALUES('c1');`);
    migrateListedStatus(db);
    migrateListedStatus(db);
    db.exec("UPDATE contrat SET status='liste' WHERE id_contrat='c1'");
    expect(db.prepare("SELECT status FROM contrat").get()?.status).toBe('liste');
    expect(db.prepare("SELECT value FROM history").get()?.value).toBe('liste');
    expect(db.prepare("SELECT * FROM members").all()).toHaveLength(1);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name='status_index'").get()).toBeTruthy();
    expect(()=>db.exec("UPDATE contrat SET status='invalid'")).toThrow();
  } finally { db.close(); }
});
