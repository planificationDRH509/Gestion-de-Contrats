import fs from "node:fs";
/** Preserve the original database once before removing the redundant column. */
export function migrateSalaryText(db, filePath) {
    var columns = db.prepare("PRAGMA table_info(contrat)").all();
    if (!columns.some(function (column) { return column.name === "salaire"; }))
        return;
    if (filePath) {
        var backup = "".concat(filePath, ".before-salary-text-migration.sqlite");
        if (!fs.existsSync(backup))
            db.prepare("VACUUM INTO ?").run(backup);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
        // Recreated by initializeContractLists with the numeric amount as its guard.
        db.exec("DROP TRIGGER IF EXISTS list_contract_update");
        db.exec("ALTER TABLE contrat DROP COLUMN salaire");
        db.exec("COMMIT");
    }
    catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}
