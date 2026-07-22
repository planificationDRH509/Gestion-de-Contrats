export type SuggestionPrefixKind = "position" | "institution" | "address";

const FRENCH_ELISION_START = /^[aeiouyàâäéèêëîïôöùûüœh]/i;
const PREFIXED_POSITION = /^(d['’]|de\s|du\s|de la\s|des\s)/i;
const PREFIXED_LOCATION = /^(a|à)\s|^(a|à)\s+l['’]|^au\s|^aux\s|^chez\s|^en\s/i;

const FEMININE_INSTITUTION_WORDS = new Set([
  "administration",
  "clinique",
  "coordination",
  "delegation",
  "direction",
  "faculte",
  "fondation",
  "mairie",
  "maternite",
  "section"
]);

const MASCULINE_INSTITUTION_WORDS = new Set([
  "bureau",
  "cabinet",
  "centre",
  "college",
  "departement",
  "dispensaire",
  "laboratoire",
  "lycee",
  "ministere",
  "palais",
  "programme",
  "sanatorium",
  "service",
  "tribunal"
]);

const PLURAL_INSTITUTION_WORDS = new Set([
  "administrations",
  "bureaux",
  "centres",
  "cliniques",
  "departements",
  "directions",
  "dispensaires",
  "hopitaux",
  "laboratoires",
  "maternites",
  "services"
]);

export function normalizeSuggestionGrammarValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function firstWord(value: string) {
  const normalized = normalizeSuggestionGrammarValue(value);
  return normalized.split(/[\s(-]+/)[0] ?? normalized;
}

export function getAutomaticSuggestionPrefix(
  value: string,
  kind: SuggestionPrefixKind
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (kind === "position") {
    if (PREFIXED_POSITION.test(trimmed)) return "";
    return FRENCH_ELISION_START.test(trimmed) ? "d'" : "de";
  }

  if (PREFIXED_LOCATION.test(trimmed)) return "";

  if (kind === "institution") {
    const word = firstWord(trimmed);
    if (PLURAL_INSTITUTION_WORDS.has(word)) return "aux";
    if (FEMININE_INSTITUTION_WORDS.has(word)) return "à la";
    if (MASCULINE_INSTITUTION_WORDS.has(word)) return "au";
  }

  return FRENCH_ELISION_START.test(trimmed) ? "à l'" : "à";
}

export function joinSuggestionPrefix(prefix: string, value: string) {
  const trimmedPrefix = prefix.trim();
  const trimmedValue = value.trim();
  if (!trimmedPrefix) return trimmedValue;
  if (/['’]$/.test(trimmedPrefix)) return `${trimmedPrefix}${trimmedValue}`;
  return `${trimmedPrefix} ${trimmedValue}`;
}

export function applySuggestionPrefix(
  value: string,
  kind: SuggestionPrefixKind,
  explicitPrefix?: string | null
) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (kind === "position" ? PREFIXED_POSITION.test(trimmed) : PREFIXED_LOCATION.test(trimmed)) {
    return trimmed;
  }

  const prefix = explicitPrefix?.trim() || getAutomaticSuggestionPrefix(trimmed, kind);
  return joinSuggestionPrefix(prefix, trimmed);
}
