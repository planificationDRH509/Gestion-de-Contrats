import { LEGACY_MINISTER, validateMinister, validateMandate } from '../src/lib/ministers';
export function initializeMinisters(db) {
    db.exec("\n    CREATE TABLE IF NOT EXISTS ministres (\n      id TEXT PRIMARY KEY, nom_complet TEXT NOT NULL CHECK(length(trim(nom_complet)) BETWEEN 1 AND 200),\n      sexe TEXT NOT NULL CHECK(sexe IN ('Homme','Femme')),\n      nif TEXT NOT NULL UNIQUE, ninu TEXT NOT NULL UNIQUE,\n      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n    );\n    CREATE TABLE IF NOT EXISTS ministre_actuel (\n      singleton INTEGER PRIMARY KEY CHECK(singleton=1),\n      ministre_id TEXT NOT NULL REFERENCES ministres(id) ON DELETE RESTRICT\n    );\n  ");
    var ministerColumns = db.prepare('PRAGMA table_info(ministres)').all();
    if (!ministerColumns.some(function (c) { return c.name === 'debut_mandat'; })) {
        db.exec('BEGIN IMMEDIATE');
        try {
            db.exec("ALTER TABLE ministres ADD COLUMN debut_mandat TEXT CHECK(debut_mandat IS NULL OR\n        (length(debut_mandat)=10 AND debut_mandat BETWEEN '0001-01-01' AND '9999-12-31'\n          AND date(debut_mandat,'+0 days') IS NOT NULL AND date(debut_mandat,'+0 days')=debut_mandat))");
            db.exec("ALTER TABLE ministres ADD COLUMN fin_mandat TEXT CHECK(fin_mandat IS NULL OR\n        (debut_mandat IS NOT NULL AND length(fin_mandat)=10 AND fin_mandat>=debut_mandat AND fin_mandat<='9999-12-31'\n          AND date(fin_mandat,'+0 days') IS NOT NULL AND date(fin_mandat,'+0 days')=fin_mandat))");
            db.prepare('UPDATE ministres SET debut_mandat=? WHERE id=?').run(LEGACY_MINISTER.mandateStartDate, LEGACY_MINISTER.id);
            db.exec('COMMIT');
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
    var seed = LEGACY_MINISTER;
    db.prepare('INSERT OR IGNORE INTO ministres(id,nom_complet,sexe,nif,ninu,debut_mandat,fin_mandat) VALUES(?,?,?,?,?,?,?)').run(seed.id, seed.fullName, seed.gender, seed.nif, seed.ninu, seed.mandateStartDate, null);
    db.prepare('INSERT OR IGNORE INTO ministre_actuel(singleton,ministre_id) VALUES(1,?)').run(seed.id);
    var columns = db.prepare('PRAGMA table_info(contrat)').all();
    if (!columns.some(function (c) { return c.name === 'ministre_id'; })) {
        // SQLite cannot ADD a non-null REFERENCES column with a non-null default.
        // Backfill first, then guard all future writes with the FK and triggers.
        db.exec('BEGIN IMMEDIATE');
        try {
            var triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='contrat'").all();
            for (var _i = 0, triggers_1 = triggers; _i < triggers_1.length; _i++) {
                var trigger = triggers_1[_i];
                db.exec("DROP TRIGGER \"".concat(trigger.name.replace(/"/g, '""'), "\""));
            }
            db.exec('ALTER TABLE contrat ADD COLUMN ministre_id TEXT REFERENCES ministres(id) ON DELETE RESTRICT');
            db.prepare('UPDATE contrat SET ministre_id=? WHERE ministre_id IS NULL').run(seed.id);
            for (var _a = 0, triggers_2 = triggers; _a < triggers_2.length; _a++) {
                var trigger = triggers_2[_a];
                db.exec(trigger.sql);
            }
            db.exec('COMMIT');
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
    db.exec("\n    CREATE INDEX IF NOT EXISTS contrat_ministre_idx ON contrat(ministre_id);\n    CREATE TRIGGER IF NOT EXISTS contract_minister_required BEFORE INSERT ON contrat\n      WHEN NEW.ministre_id IS NULL BEGIN SELECT RAISE(ABORT,'Ministre obligatoire.'); END;\n    CREATE TRIGGER IF NOT EXISTS contract_minister_immutable BEFORE UPDATE OF ministre_id ON contrat\n      WHEN NEW.ministre_id IS NOT OLD.ministre_id BEGIN SELECT RAISE(ABORT,'Le ministre d\u2019un contrat existant ne peut pas \u00EAtre remplac\u00E9.'); END;\n  ");
}
export function readMinisters(db) {
    return {
        ministers: db.prepare('SELECT id,nom_complet AS fullName,sexe AS gender,nif,ninu,debut_mandat AS mandateStartDate,fin_mandat AS mandateEndDate FROM ministres ORDER BY nom_complet').all(),
        currentMinisterId: db.prepare('SELECT ministre_id FROM ministre_actuel WHERE singleton=1').get().ministre_id
    };
}
export function readContractMinister(db, ministerId) {
    return db.prepare('SELECT id,nom_complet AS fullName,sexe AS gender,nif,ninu,debut_mandat AS mandateStartDate,fin_mandat AS mandateEndDate FROM ministres WHERE id=?').get(ministerId);
}
export function selectContractMinister(db, requestedId) {
    var id = requestedId || readMinisters(db).currentMinisterId;
    if (!readContractMinister(db, id))
        throw new Error('Ministre introuvable.');
    return id;
}
export function manageMinisters(db, input, role) {
    var _a, _b, _c;
    if (role !== 'admin')
        throw new Error('Modification réservée aux administrateurs.');
    db.exec('BEGIN IMMEDIATE');
    try {
        if (input.action === 'add') {
            var minister_1 = validateMinister(input.minister);
            var previous_1 = readContractMinister(db, minister_1.id);
            if (previous_1) {
                if (Object.keys(minister_1).some(function (key) { return previous_1[key] !== minister_1[key]; }))
                    throw new Error('Ce ministre existe déjà avec des informations différentes.');
            }
            else {
                if (db.prepare('SELECT id FROM ministres WHERE nif=? OR ninu=?').get(minister_1.nif, minister_1.ninu))
                    throw new Error('Un ministre possède déjà ce NIF ou ce NINU.');
                db.prepare('INSERT INTO ministres(id,nom_complet,sexe,nif,ninu,debut_mandat,fin_mandat) VALUES(?,?,?,?,?,?,?)').run(minister_1.id, minister_1.fullName, minister_1.gender, minister_1.nif, minister_1.ninu, minister_1.mandateStartDate, (_a = minister_1.mandateEndDate) !== null && _a !== void 0 ? _a : null);
            }
        }
        else if (input.action === 'mandate') {
            var id = typeof input.ministerId === 'string' ? input.ministerId : '';
            var minister = readContractMinister(db, id);
            if (!minister)
                throw new Error('Ministre introuvable.');
            if (((_b = minister.mandateStartDate) !== null && _b !== void 0 ? _b : null) !== input.expectedStartDate || ((_c = minister.mandateEndDate) !== null && _c !== void 0 ? _c : null) !== input.expectedEndDate) {
                throw new Error('Le mandat a changé. Rechargez les ministres avant de réessayer.');
            }
            var dates = validateMandate(input.mandateStartDate, input.mandateEndDate);
            db.prepare('UPDATE ministres SET debut_mandat=?,fin_mandat=? WHERE id=?').run(dates.mandateStartDate, dates.mandateEndDate, id);
        }
        else if (input.action === 'select') {
            var id = typeof input.ministerId === 'string' ? input.ministerId : '';
            if (!readContractMinister(db, id))
                throw new Error('Ministre introuvable.');
            db.prepare('UPDATE ministre_actuel SET ministre_id=? WHERE singleton=1').run(id);
        }
        else
            throw new Error('Action invalide.');
        var result = readMinisters(db);
        db.exec('COMMIT');
        return result;
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
