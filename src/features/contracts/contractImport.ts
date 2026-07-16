import type { Gender } from "../../data/types";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";

export type ContractImportFieldId =
  | "ignore"
  | "nif"
  | "ninu"
  | "lastName"
  | "firstName"
  | "gender"
  | "address"
  | "salaryNumber"
  | "salaryText"
  | "position"
  | "assignment"
  | "durationMonths"
  | "commentaire";

type DestinationFieldId = Exclude<ContractImportFieldId, "ignore">;

export type ContractImportMapping = ContractImportFieldId[];

export type ParsedContractImportTable = {
  headers: string[];
  rows: string[][];
  delimiter: string;
};

const IMPORT_PREFIXED_POSITION = /^(d['’]|de\s|du\s|de la\s|des\s)/i;
const IMPORT_PREFIXED_LOCATION = /^(a|à)\s|^(a|à)\s+l['’]|^au\s|^aux\s|^chez\s|^en\s/i;


export type ContractImportDraft = {
  gender: Gender;
  firstName: string;
  lastName: string;
  nif: string;
  ninu: string | null;
  address: string;
  position: string;
  assignment: string;
  salaryNumber: number;
  salaryText: string;
  durationMonths: number;
  commentaire: string | null;
};

export type ContractImportPreviewRow = {
  sourceRowNumber: number;
  values: ContractImportDraft | null;
  errors: string[];
  warnings: string[];
};

export type ContractImportEditableField =
  | "nif"
  | "ninu"
  | "lastName"
  | "firstName"
  | "gender"
  | "address"
  | "salaryNumber"
  | "salaryText"
  | "position"
  | "assignment"
  | "durationMonths"
  | "commentaire";

export type ContractImportEditableRow = Record<ContractImportEditableField, string> & {
  id: string;
  sourceRowNumber: number;
  excluded: boolean;
};

export type ContractImportValidatedEditableRow = {
  id: string;
  sourceRowNumber: number;
  excluded: boolean;
  values: ContractImportDraft | null;
  errors: string[];
  warnings: string[];
};

export const CONTRACT_IMPORT_FIELDS: { id: ContractImportFieldId; label: string }[] = [
  { id: "ignore", label: "Ignorer" },
  { id: "nif", label: "NIF" },
  { id: "ninu", label: "NINU" },
  { id: "lastName", label: "Nom" },
  { id: "firstName", label: "Prénom" },
  { id: "gender", label: "Sexe" },
  { id: "address", label: "Adresse" },
  { id: "salaryNumber", label: "Salaire" },
  { id: "salaryText", label: "Salaire en lettres" },
  { id: "position", label: "Poste" },
  { id: "assignment", label: "Affectation" },
  { id: "durationMonths", label: "Durée" },
  { id: "commentaire", label: "Commentaire" }
];

export const REQUIRED_IMPORT_FIELDS: DestinationFieldId[] = [
  "nif",
  "lastName",
  "firstName",
  "gender",
  "address",
  "salaryNumber",
  "position",
  "assignment"
];

const FIELD_ALIASES: Record<DestinationFieldId, string[]> = {
  nif: ["nif", "numero nif", "numéro nif", "identifiant fiscal", "matricule fiscale"],
  ninu: ["ninu", "ni nu", "numero unique", "numéro unique"],
  lastName: ["nom", "nom de famille", "lastname", "last name", "surname"],
  firstName: ["prenom", "prénom", "prenoms", "prénoms", "first name", "firstname"],
  gender: ["sexe", "genre", "gender", "sex"],
  address: ["adresse", "address", "domicile", "residence", "résidence"],
  salaryNumber: ["salaire", "salaire en chiffre", "salaire chiffre", "montant", "salary", "traitement"],
  salaryText: ["salaire en lettre", "salaire en lettres", "salaire lettre", "salary text"],
  position: ["poste", "fonction", "titre", "emploi", "position"],
  assignment: ["affectation", "lieu affectation", "lieu d affectation", "institution", "service", "site"],
  durationMonths: ["duree", "durée", "duree contrat", "durée contrat", "mois", "duration"],
  commentaire: ["commentaire", "commentaires", "observation", "observations", "note", "notes"]
};

const FIELD_DETECTION_ORDER: DestinationFieldId[] = [
  "salaryText",
  "salaryNumber",
  "durationMonths",
  "assignment",
  "firstName",
  "lastName",
  "commentaire",
  "address",
  "position",
  "gender",
  "ninu",
  "nif"
];

const FIELD_LABELS = new Map(CONTRACT_IMPORT_FIELDS.map((field) => [field.id, field.label]));

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = ["\t", ";", ","];
  return candidates.reduce((best, delimiter) =>
    countDelimiter(firstLine, delimiter) > countDelimiter(firstLine, best) ? delimiter : best
  );
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!inQuotes && char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

export function parsePastedContractTable(text: string): ParsedContractImportTable {
  const trimmed = text.replace(/^\uFEFF/, "");
  if (!trimmed.trim()) return { headers: [], rows: [], delimiter: "\t" };

  const delimiter = detectDelimiter(trimmed);
  const [rawHeaders = [], ...rawRows] = parseDelimitedRows(trimmed, delimiter);
  const headers = rawHeaders.map((header, index) => header.trim() || `Colonne ${index + 1}`);
  const rows = rawRows.filter((row) => row.some((cell) => cell.trim().length > 0));
  return { headers, rows, delimiter };
}

function detectField(header: string): ContractImportFieldId {
  const normalized = normalizeHeader(header);
  if (!normalized) return "ignore";

  for (const field of FIELD_DETECTION_ORDER) {
    if (FIELD_ALIASES[field].some((alias) => normalizeHeader(alias) === normalized)) {
      return field;
    }
  }

  for (const field of FIELD_DETECTION_ORDER) {
    if (
      FIELD_ALIASES[field]
        .map(normalizeHeader)
        .filter((alias) => alias.length > 3)
        .some((alias) => normalized.includes(alias))
    ) {
      return field;
    }
  }

  return "ignore";
}

export function inferImportMapping(headers: string[]): ContractImportMapping {
  return headers.map(detectField);
}

export function getImportFieldLabel(field: ContractImportFieldId) {
  return FIELD_LABELS.get(field) ?? field;
}

export function validateImportMapping(mapping: ContractImportMapping) {
  const counts = new Map<DestinationFieldId, number>();
  mapping.forEach((field) => {
    if (field === "ignore") return;
    counts.set(field, (counts.get(field) ?? 0) + 1);
  });
  return {
    missingFields: REQUIRED_IMPORT_FIELDS.filter((field) => !counts.has(field)),
    duplicateFields: Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([field]) => field)
  };
}

function getMappedValue(row: string[], mapping: ContractImportMapping, field: DestinationFieldId) {
  const index = mapping.findIndex((mappedField) => mappedField === field);
  const value = index >= 0 ? (row[index] ?? "").trim() : "";

  if (field === "position") {
    return value.replace(IMPORT_PREFIXED_POSITION, "");
  }
  if (field === "address" || field === "assignment") {
    return value.replace(IMPORT_PREFIXED_LOCATION, "");
  }

  return value;
}

function normalizeNif(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function normalizeNinu(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { value: null, error: null };
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) {
    return { value: null, error: "Le NINU doit comporter exactement 10 chiffres." };
  }
  return { value: digits, error: null };
}

function normalizeGender(value: string): Gender | null {
  const normalized = normalizeHeader(value);
  if (["h", "homme", "masculin", "m", "male", "monsieur"].includes(normalized)) return "Homme";
  if (["f", "femme", "feminin", "female", "madame"].includes(normalized)) return "Femme";
  return null;
}

export function parseImportMoney(value: string) {
  const compact = value.trim().replace(/\s|\u00a0/g, "").replace(/[^\d,.-]/g, "");
  if (!compact) return null;

  const normalized = compact.replace(/[,.]/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseDurationMonths(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 12;
  const match = trimmed.match(/\d+/);
  if (!match) return null;
  return Number.parseInt(match[0], 10);
}

function normalizeNifKey(value: string) {
  return value.replace(/\D/g, "");
}

function buildRowDraft(
  row: string[],
  mapping: ContractImportMapping
): { values: ContractImportDraft | null; errors: string[] } {
  const errors: string[] = [];
  const firstName = getMappedValue(row, mapping, "firstName");
  const lastName = getMappedValue(row, mapping, "lastName");
  const address = getMappedValue(row, mapping, "address");
  const position = getMappedValue(row, mapping, "position");
  const assignment = getMappedValue(row, mapping, "assignment");
  const nif = normalizeNif(getMappedValue(row, mapping, "nif"));
  const ninu = normalizeNinu(getMappedValue(row, mapping, "ninu"));
  const gender = normalizeGender(getMappedValue(row, mapping, "gender"));
  const salaryNumber = parseImportMoney(getMappedValue(row, mapping, "salaryNumber"));
  const durationMonths = parseDurationMonths(getMappedValue(row, mapping, "durationMonths"));
  const salaryTextValue = getMappedValue(row, mapping, "salaryText");
  const commentaire = getMappedValue(row, mapping, "commentaire");

  if (!nif) errors.push("Le NIF doit contenir 10 chiffres.");
  if (ninu.error) errors.push(ninu.error);
  if (!firstName) errors.push("Le prénom est obligatoire.");
  if (!lastName) errors.push("Le nom est obligatoire.");
  if (!gender) errors.push("Le sexe est invalide.");
  if (!address) errors.push("L'adresse est obligatoire.");
  if (!position) errors.push("Le poste est obligatoire.");
  if (!assignment) errors.push("L'affectation est obligatoire.");
  if (salaryNumber === null || salaryNumber <= 0) errors.push("Le salaire est invalide.");
  if (durationMonths === null || durationMonths < 1 || durationMonths > 12) {
    errors.push("La durée doit être comprise entre 1 et 12 mois.");
  }

  if (errors.length > 0 || !nif || !gender || salaryNumber === null || durationMonths === null) {
    return { values: null, errors };
  }

  return {
    values: {
      gender,
      firstName,
      lastName,
      nif,
      ninu: ninu.value,
      address,
      position,
      assignment,
      salaryNumber,
      salaryText: salaryTextValue || numberToFrenchWords(salaryNumber),
      durationMonths,
      commentaire: commentaire || null
    },
    errors
  };
}

function buildDraftFromEditableRow(row: ContractImportEditableRow) {
  const errors: string[] = [];
  const firstName = row.firstName.trim();
  const lastName = row.lastName.trim();
  const address = row.address.trim();
  const position = row.position.trim();
  const assignment = row.assignment.trim();
  const nif = normalizeNif(row.nif);
  const ninu = normalizeNinu(row.ninu);
  const gender = normalizeGender(row.gender);
  const salaryNumber = parseImportMoney(row.salaryNumber);
  const durationMonths = parseDurationMonths(row.durationMonths);
  const salaryTextValue = row.salaryText.trim();
  const commentaire = row.commentaire.trim();

  if (!nif) errors.push("Le NIF doit contenir 10 chiffres.");
  if (ninu.error) errors.push(ninu.error);
  if (!firstName) errors.push("Le prénom est obligatoire.");
  if (!lastName) errors.push("Le nom est obligatoire.");
  if (!gender) errors.push("Le sexe est invalide.");
  if (!address) errors.push("L'adresse est obligatoire.");
  if (!position) errors.push("Le poste est obligatoire.");
  if (!assignment) errors.push("L'affectation est obligatoire.");
  if (salaryNumber === null || salaryNumber <= 0) errors.push("Le salaire est invalide.");
  if (durationMonths === null || durationMonths < 1 || durationMonths > 12) {
    errors.push("La durée doit être comprise entre 1 et 12 mois.");
  }

  if (errors.length > 0 || !nif || !gender || salaryNumber === null || durationMonths === null) {
    return { values: null, errors };
  }

  return {
    values: {
      gender,
      firstName,
      lastName,
      nif,
      ninu: ninu.value,
      address,
      position,
      assignment,
      salaryNumber,
      salaryText: salaryTextValue || numberToFrenchWords(salaryNumber),
      durationMonths,
      commentaire: commentaire || null
    },
    errors
  };
}

export function buildImportEditableRows(
  table: ParsedContractImportTable,
  mapping: ContractImportMapping
): ContractImportEditableRow[] {
  return table.rows.map((row, index) => {
    const salaryNumber = getMappedValue(row, mapping, "salaryNumber");
    const parsedSalary = parseImportMoney(salaryNumber);
    const salaryText = getMappedValue(row, mapping, "salaryText");
    const durationMonths = getMappedValue(row, mapping, "durationMonths");
    const normalizedNif = normalizeNif(getMappedValue(row, mapping, "nif"));
    const normalizedGender = normalizeGender(getMappedValue(row, mapping, "gender"));

    return {
      id: `row-${index + 2}`,
      sourceRowNumber: index + 2,
      excluded: false,
      nif: normalizedNif ?? getMappedValue(row, mapping, "nif"),
      ninu: getMappedValue(row, mapping, "ninu"),
      lastName: getMappedValue(row, mapping, "lastName"),
      firstName: getMappedValue(row, mapping, "firstName"),
      gender: normalizedGender ?? getMappedValue(row, mapping, "gender"),
      address: getMappedValue(row, mapping, "address"),
      salaryNumber,
      salaryText: salaryText || (parsedSalary ? numberToFrenchWords(parsedSalary) : ""),
      position: getMappedValue(row, mapping, "position"),
      assignment: getMappedValue(row, mapping, "assignment"),
      durationMonths: durationMonths || "12",
      commentaire: getMappedValue(row, mapping, "commentaire")
    };
  });
}

export function validateImportEditableRows(
  rows: ContractImportEditableRow[],
  options: { existingNifs?: string[] } = {}
): ContractImportValidatedEditableRow[] {
  const existingNifs = new Set((options.existingNifs ?? []).map(normalizeNifKey).filter(Boolean));
  const importNifCounts = new Map<string, number>();

  rows.forEach((row) => {
    if (row.excluded) return;
    const nif = normalizeNif(row.nif);
    if (!nif) return;
    const key = normalizeNifKey(nif);
    importNifCounts.set(key, (importNifCounts.get(key) ?? 0) + 1);
  });

  return rows.map((row) => {
    const result = row.excluded
      ? { values: null, errors: [] }
      : buildDraftFromEditableRow(row);
    const warnings: string[] = [];
    const nif = normalizeNif(row.nif);
    if (!row.excluded && nif) {
      const key = normalizeNifKey(nif);
      if ((importNifCounts.get(key) ?? 0) > 1) {
        warnings.push("Doublon possible: NIF répété dans le collage.");
      }
      if (existingNifs.has(key)) {
        warnings.push("Doublon possible: NIF déjà présent dans les contrats affichés.");
      }
    }
    return {
      id: row.id,
      sourceRowNumber: row.sourceRowNumber,
      excluded: row.excluded,
      values: result.values,
      errors: result.errors,
      warnings
    };
  });
}

export function buildImportPreview(
  table: ParsedContractImportTable,
  mapping: ContractImportMapping,
  options: { existingNifs?: string[] } = {}
) {
  const existingNifs = new Set((options.existingNifs ?? []).map(normalizeNifKey).filter(Boolean));
  const previews: ContractImportPreviewRow[] = table.rows.map((row, index) => {
    const result = buildRowDraft(row, mapping);
    return {
      sourceRowNumber: index + 2,
      values: result.values,
      errors: result.errors,
      warnings: []
    };
  });

  const importNifCounts = new Map<string, number>();
  table.rows.forEach((row) => {
    const key = normalizeNifKey(getMappedValue(row, mapping, "nif"));
    if (!key) return;
    importNifCounts.set(key, (importNifCounts.get(key) ?? 0) + 1);
  });

  previews.forEach((preview) => {
    if (!preview.values) return;
    const key = normalizeNifKey(preview.values.nif);
    if ((importNifCounts.get(key) ?? 0) > 1) {
      preview.warnings.push("Doublon possible: NIF répété dans le collage.");
    }
    if (existingNifs.has(key)) {
      preview.warnings.push("Doublon possible: NIF déjà présent dans les contrats affichés.");
    }
  });

  return previews;
}
