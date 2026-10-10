export type Minister = {
  id: string;
  fullName: string;
  gender: "Homme" | "Femme";
  nif: string;
  ninu: string;
  mandateStartDate?: string | null;
  mandateEndDate?: string | null;
};

export type MinisterRegistry = { ministers: Minister[]; currentMinisterId: string };
export const LEGACY_MINISTER: Minister = {
  id: "bertrand-sinal",
  fullName: "Bertrand SINAL",
  gender: "Homme",
  nif: "003-888-685-8",
  ninu: "1009241060",
  mandateStartDate: "2020-01-01",
  mandateEndDate: null
};
export const MINISTRY_ADDRESS = "numéro 1 Rue Jacques Roumain, Maïs Gâté, Port-au-Prince";

export function validateMandate(start?: string | null, end?: string | null) {
  const mandateStartDate = start?.trim() || null;
  const mandateEndDate = end?.trim() || null;
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!mandateStartDate || !valid(mandateStartDate)) throw new Error("Renseignez une date de début de mandat valide.");
  if (mandateEndDate && !valid(mandateEndDate)) throw new Error("Renseignez une date de fin de mandat valide.");
  if (mandateEndDate && mandateEndDate < mandateStartDate) throw new Error("La fin du mandat ne peut pas précéder son début.");
  return { mandateStartDate, mandateEndDate };
}

export function validateMinister(input: Minister): Minister {
  const fullName = input.fullName?.trim().replace(/\s+/g, " ");
  const nif = input.nif?.replace(/[\s-]/g, "");
  const ninu = input.ninu?.trim();
  if (!input.id || input.id.length > 150) throw new Error("Identifiant du ministre invalide.");
  if (!fullName || fullName.length > 200) throw new Error("Le nom complet est obligatoire (200 caractères maximum).");
  if (input.gender !== "Homme" && input.gender !== "Femme") throw new Error("Sélectionnez le sexe du ministre.");
  if (!/^\d{10}$/.test(nif)) throw new Error("Le NIF doit contenir 10 chiffres.");
  if (!/^\d{10}$/.test(ninu)) throw new Error("Le NINU doit contenir 10 chiffres.");
  return { id: input.id, fullName, gender: input.gender, nif: nif.replace(/^(\d{3})(\d{3})(\d{3})(\d)$/, "$1-$2-$3-$4"), ninu,
    ...validateMandate(input.mandateStartDate, input.mandateEndDate) };
}

export function findContractMinister(contract: { ministerId?: string; minister?: Minister }, registry?: MinisterRegistry): Minister | undefined {
  const id = contract.ministerId || LEGACY_MINISTER.id;
  const current = registry?.ministers.find(minister => minister.id === id);
  if (current) return current;
  if (contract.minister?.id === id) return contract.minister;
  if (id === LEGACY_MINISTER.id) return LEGACY_MINISTER;
  return undefined;
}

export function isContractStartOutsideMandate(contractStartDate: string, minister: Minister): boolean {
  // Compare calendar dates, without converting midnight through a time zone.
  return Boolean((minister.mandateStartDate && contractStartDate < minister.mandateStartDate)
    || (minister.mandateEndDate && contractStartDate > minister.mandateEndDate));
}

export function ministerTemplateVariables(minister: Minister) {
  const feminine = minister.gender === "Femme";
  const legacy = minister.id === LEGACY_MINISTER.id;
  return {
    minister_id: minister.id,
    minister_full_name: minister.fullName,
    minister_name: `${legacy ? "Docteur" : feminine ? "Madame" : "Monsieur"} ${minister.fullName}`,
    minister_signature: `${legacy ? "Dr " : ""}${minister.fullName}`,
    minister_nif: minister.nif,
    minister_ninu: minister.ninu,
    minister_gender: minister.gender,
    minister_address: MINISTRY_ADDRESS,
    minister_identified: feminine ? "identifiée" : "identifié",
    minister_domiciled: feminine ? "domiciliée" : "domicilié"
  };
}
