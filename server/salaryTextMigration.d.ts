import type { DatabaseSync } from "node:sqlite";
/** Preserve the original database once before removing the redundant column. */
export declare function migrateSalaryText(db: DatabaseSync, filePath?: string): void;
