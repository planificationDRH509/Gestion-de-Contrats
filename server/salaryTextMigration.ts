import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

/** Preserve the original database once before removing the redundant column. */
export function migrateSalaryText(db: DatabaseSync, filePath?: string) {
  const columns = db.prepare("PRAGMA table_info(contrat)").all();
  if (!columns.some(column => column.name === "salaire")) return;
  if (filePath) {
    const backup = `${filePath}.before-salary-text-migration.sqlite`;
    if (!fs.existsSync(backup)) db.prepare("VACUUM INTO ?").run(backup);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    // Recreated by initializeContractLists with the numeric amount as its guard.
    db.exec("DROP TRIGGER IF EXISTS list_contract_update");
    db.exec("ALTER TABLE contrat DROP COLUMN salaire");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
