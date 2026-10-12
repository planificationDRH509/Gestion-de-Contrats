import type { DatabaseSync } from "node:sqlite";
/** Rebuild the legacy CHECK constraint without losing rows, indexes or triggers. */
export declare function migrateListedStatus(db: DatabaseSync): void;
