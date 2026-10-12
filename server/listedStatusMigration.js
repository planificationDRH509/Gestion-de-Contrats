/** Rebuild the legacy CHECK constraint without losing rows, indexes or triggers. */
export function migrateListedStatus(db) {
    var _a, _b, _c;
    var row = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='contrat'").get();
    var sql = String((_a = row === null || row === void 0 ? void 0 : row.sql) !== null && _a !== void 0 ? _a : "");
    if (!sql || sql.includes("'liste'") || !/CHECK\s*\(\s*status\s+IN/i.test(sql))
        return;
    var schema = db.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name='contrat' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
    var columns = db.prepare("PRAGMA table_info(contrat)").all().map(function (c) { return "\"".concat(String(c.name).replaceAll('"', '""'), "\""); }).join(',');
    var foreignKeys = (_b = db.prepare("PRAGMA foreign_keys").get()) === null || _b === void 0 ? void 0 : _b.foreign_keys;
    var legacyAlter = (_c = db.prepare("PRAGMA legacy_alter_table").get()) === null || _c === void 0 ? void 0 : _c.legacy_alter_table;
    db.exec("PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE");
    try {
        db.exec(sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?contrat["`\]]?/i, 'CREATE TABLE contrat_listed_migration')
            .replace(/(CHECK\s*\(\s*status\s+IN\s*\()/i, "$1'liste',"));
        db.exec("INSERT INTO contrat_listed_migration (".concat(columns, ") SELECT ").concat(columns, " FROM contrat;\n      DROP TABLE contrat;\n      ALTER TABLE contrat_listed_migration RENAME TO contrat;"));
        for (var _i = 0, schema_1 = schema; _i < schema_1.length; _i++) {
            var item = schema_1[_i];
            db.exec(String(item.sql));
        }
        if (db.prepare("PRAGMA foreign_key_check").all().length)
            throw new Error("Migration des états : références invalides.");
        db.exec("COMMIT");
    }
    catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
    finally {
        db.exec("PRAGMA foreign_keys=".concat(foreignKeys ? 'ON' : 'OFF', "; PRAGMA legacy_alter_table=").concat(legacyAlter ? 'ON' : 'OFF'));
    }
}
