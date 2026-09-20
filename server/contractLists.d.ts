import type { DatabaseSync } from "node:sqlite";
type Row = Record<string, any>;
export declare function initializeContractLists(db: DatabaseSync): void;
export declare function readContractLists(db: DatabaseSync, workspaceId: string): {
    id: any;
    workspaceId: any;
    durationMonths: any;
    visaNumber: any;
    sealedAt: any;
    version: any;
    createdAt: any;
    history: any;
    members: {
        [x: string]: any;
    }[];
}[];
export declare function mutateContractList(db: DatabaseSync, workspaceId: string, input: Row, actor: {
    name: string;
    role?: string | null;
}): any;
export {};
