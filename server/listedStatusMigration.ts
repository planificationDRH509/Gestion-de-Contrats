import type { DatabaseSync } from "node:sqlite";

/** Rebuild the legacy CHECK constraint without losing rows, indexes or triggers. */
export function migrateListedStatus(db: DatabaseSync) {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='contrat'").get();
  const sql = String(row?.sql ?? "");
  if (!sql || sql.includes("'liste'") || !/CHECK\s*\(\s*status\s+IN/i.test(sql)) return;
  const schema = db.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name='contrat' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  const columns = db.prepare("PRAGMA table_info(contrat)").all().map(c => `"${String(c.name).replaceAll('"', '""')}"`).join(',');
  const foreignKeys = db.prepare("PRAGMA foreign_keys").get()?.foreign_keys;
  const legacyAlter = db.prepare("PRAGMA legacy_alter_table").get()?.legacy_alter_table;
  db.exec("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE");
  try {
    db.exec(sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?contrat["`\]]?/i, 'CREATE TABLE contrat_listed_migration')
      .replace(/(CHECK\s*\(\s*status\s+IN\s*\()/i, "$1'liste',"));
    db.exec(`INSERT INTO contrat_listed_migration (${columns}) SELECT ${columns} FROM contrat;
      DROP TABLE contrat;
      ALTER TABLE contrat_listed_migration RENAME TO contrat;`);
    for (const item of schema) db.exec(String(item.sql));
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Migration des états : références invalides.");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec(`PRAGMA foreign_keys=${foreignKeys ? 'ON' : 'OFF'}; PRAGMA legacy_alter_table=${legacyAlter ? 'ON' : 'OFF'}`);
  }
}
