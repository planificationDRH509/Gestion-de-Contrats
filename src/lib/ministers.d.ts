export type Minister = {
    id: string;
    fullName: string;
    gender: "Homme" | "Femme";
    nif: string;
    ninu: string;
    mandateStartDate?: string | null;
    mandateEndDate?: string | null;
};
export type MinisterRegistry = {
    ministers: Minister[];
    currentMinisterId: string;
};
export declare const LEGACY_MINISTER: Minister;
export declare const MINISTRY_ADDRESS = "num\u00E9ro 1 Rue Jacques Roumain, Ma\u00EFs G\u00E2t\u00E9, Port-au-Prince";
export declare function validateMandate(start?: string | null, end?: string | null): {
    mandateStartDate: string;
    mandateEndDate: string | null;
};
export declare function validateMinister(input: Minister): Minister;
export declare function findContractMinister(contract: {
    ministerId?: string;
    minister?: Minister;
}, registry?: MinisterRegistry): Minister | undefined;
export declare function isContractStartOutsideMandate(contractStartDate: string, minister: Minister): boolean;
export declare function ministerTemplateVariables(minister: Minister): {
    minister_id: string;
    minister_full_name: string;
    minister_name: string;
    minister_signature: string;
    minister_nif: string;
    minister_ninu: string;
    minister_gender: "Homme" | "Femme";
    minister_address: string;
    minister_identified: string;
    minister_domiciled: string;
};
