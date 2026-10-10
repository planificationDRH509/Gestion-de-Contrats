import type { DatabaseSync } from 'node:sqlite';
import { LEGACY_MINISTER, validateMinister, validateMandate, type Minister, type MinisterRegistry } from '../src/lib/ministers';

export function initializeMinisters(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ministres (
      id TEXT PRIMARY KEY, nom_complet TEXT NOT NULL CHECK(length(trim(nom_complet)) BETWEEN 1 AND 200),
      sexe TEXT NOT NULL CHECK(sexe IN ('Homme','Femme')),
      nif TEXT NOT NULL UNIQUE, ninu TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ministre_actuel (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      ministre_id TEXT NOT NULL REFERENCES ministres(id) ON DELETE RESTRICT
    );
  `);
  const ministerColumns = db.prepare('PRAGMA table_info(ministres)').all();
  if (!ministerColumns.some(c => c.name === 'debut_mandat')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`ALTER TABLE ministres ADD COLUMN debut_mandat TEXT CHECK(debut_mandat IS NULL OR
        (length(debut_mandat)=10 AND debut_mandat BETWEEN '0001-01-01' AND '9999-12-31'
          AND date(debut_mandat,'+0 days') IS NOT NULL AND date(debut_mandat,'+0 days')=debut_mandat))`);
      db.exec(`ALTER TABLE ministres ADD COLUMN fin_mandat TEXT CHECK(fin_mandat IS NULL OR
        (debut_mandat IS NOT NULL AND length(fin_mandat)=10 AND fin_mandat>=debut_mandat AND fin_mandat<='9999-12-31'
          AND date(fin_mandat,'+0 days') IS NOT NULL AND date(fin_mandat,'+0 days')=fin_mandat))`);
      db.prepare('UPDATE ministres SET debut_mandat=? WHERE id=?').run(LEGACY_MINISTER.mandateStartDate!, LEGACY_MINISTER.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const seed = LEGACY_MINISTER;
  db.prepare('INSERT OR IGNORE INTO ministres(id,nom_complet,sexe,nif,ninu,debut_mandat,fin_mandat) VALUES(?,?,?,?,?,?,?)').run(seed.id, seed.fullName, seed.gender, seed.nif, seed.ninu, seed.mandateStartDate!, null);
  db.prepare('INSERT OR IGNORE INTO ministre_actuel(singleton,ministre_id) VALUES(1,?)').run(seed.id);
  const columns = db.prepare('PRAGMA table_info(contrat)').all();
  if (!columns.some(c => c.name === 'ministre_id')) {
    // SQLite cannot ADD a non-null REFERENCES column with a non-null default.
    // Backfill first, then guard all future writes with the FK and triggers.
    db.exec('BEGIN IMMEDIATE');
    try {
      const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='contrat'").all() as { name: string; sql: string }[];
      for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name.replace(/"/g, '""')}"`);
      db.exec('ALTER TABLE contrat ADD COLUMN ministre_id TEXT REFERENCES ministres(id) ON DELETE RESTRICT');
      db.prepare('UPDATE contrat SET ministre_id=? WHERE ministre_id IS NULL').run(seed.id);
      for (const trigger of triggers) db.exec(trigger.sql);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS contrat_ministre_idx ON contrat(ministre_id);
    CREATE TRIGGER IF NOT EXISTS contract_minister_required BEFORE INSERT ON contrat
      WHEN NEW.ministre_id IS NULL BEGIN SELECT RAISE(ABORT,'Ministre obligatoire.'); END;
    CREATE TRIGGER IF NOT EXISTS contract_minister_immutable BEFORE UPDATE OF ministre_id ON contrat
      WHEN NEW.ministre_id IS NOT OLD.ministre_id BEGIN SELECT RAISE(ABORT,'Le ministre d’un contrat existant ne peut pas être remplacé.'); END;
  `);
}

export function readMinisters(db: DatabaseSync): MinisterRegistry {
  return {
    ministers: db.prepare('SELECT id,nom_complet AS fullName,sexe AS gender,nif,ninu,debut_mandat AS mandateStartDate,fin_mandat AS mandateEndDate FROM ministres ORDER BY nom_complet').all() as Minister[],
    currentMinisterId: (db.prepare('SELECT ministre_id FROM ministre_actuel WHERE singleton=1').get() as { ministre_id: string }).ministre_id
  };
}
export function readContractMinister(db: DatabaseSync, ministerId: string) {
  return db.prepare('SELECT id,nom_complet AS fullName,sexe AS gender,nif,ninu,debut_mandat AS mandateStartDate,fin_mandat AS mandateEndDate FROM ministres WHERE id=?').get(ministerId) as Minister | undefined;
}
export function selectContractMinister(db: DatabaseSync, requestedId?: string | null): string {
  const id = requestedId || readMinisters(db).currentMinisterId;
  if (!readContractMinister(db, id)) throw new Error('Ministre introuvable.');
  return id;
}
export function manageMinisters(db: DatabaseSync, input: Record<string, unknown>, role?: string | null): MinisterRegistry {
  if (role !== 'admin') throw new Error('Modification réservée aux administrateurs.');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (input.action === 'add') {
      const minister = validateMinister(input.minister as Minister);
      const previous = readContractMinister(db, minister.id);
      if (previous) {
        if (Object.keys(minister).some(key => previous[key as keyof Minister] !== minister[key as keyof Minister])) throw new Error('Ce ministre existe déjà avec des informations différentes.');
      } else {
        if (db.prepare('SELECT id FROM ministres WHERE nif=? OR ninu=?').get(minister.nif, minister.ninu)) throw new Error('Un ministre possède déjà ce NIF ou ce NINU.');
        db.prepare('INSERT INTO ministres(id,nom_complet,sexe,nif,ninu,debut_mandat,fin_mandat) VALUES(?,?,?,?,?,?,?)').run(minister.id,minister.fullName,minister.gender,minister.nif,minister.ninu,minister.mandateStartDate!,minister.mandateEndDate ?? null);
      }
    } else if (input.action === 'mandate') {
      const id = typeof input.ministerId === 'string' ? input.ministerId : '';
      const minister = readContractMinister(db, id);
      if (!minister) throw new Error('Ministre introuvable.');
      if ((minister.mandateStartDate ?? null) !== input.expectedStartDate || (minister.mandateEndDate ?? null) !== input.expectedEndDate) {
        throw new Error('Le mandat a changé. Rechargez les ministres avant de réessayer.');
      }
      const dates = validateMandate(input.mandateStartDate as string, input.mandateEndDate as string | null);
      db.prepare('UPDATE ministres SET debut_mandat=?,fin_mandat=? WHERE id=?').run(dates.mandateStartDate, dates.mandateEndDate, id);
    } else if (input.action === 'select') {
      const id = typeof input.ministerId === 'string' ? input.ministerId : '';
      if (!readContractMinister(db,id)) throw new Error('Ministre introuvable.');
      db.prepare('UPDATE ministre_actuel SET ministre_id=? WHERE singleton=1').run(id);
    } else throw new Error('Action invalide.');
    const result = readMinisters(db);
    db.exec('COMMIT');
    return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
