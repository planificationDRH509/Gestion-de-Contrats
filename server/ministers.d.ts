import type { DatabaseSync } from 'node:sqlite';
import { type Minister, type MinisterRegistry } from '../src/lib/ministers';
export declare function initializeMinisters(db: DatabaseSync): void;
export declare function readMinisters(db: DatabaseSync): MinisterRegistry;
export declare function readContractMinister(db: DatabaseSync, ministerId: string): Minister | undefined;
export declare function selectContractMinister(db: DatabaseSync, requestedId?: string | null): string;
export declare function manageMinisters(db: DatabaseSync, input: Record<string, unknown>, role?: string | null): MinisterRegistry;
