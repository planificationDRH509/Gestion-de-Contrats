export type SuggestionPrefixKind = "position" | "institution" | "address";

const FRENCH_ELISION_START = /^[aeiouyàâäéèêëîïôöùûüœh]/i;
const PREFIXED_POSITION = /^(?:(?:à titre|au poste|en qualité)\s+(?:de\s+|d['’])|comme\s+|d['’]|de\s+(?:l['’]|la\s+|le\s+)?|du\s+|des\s+)/i;
const PREFIXED_LOCATION = /^(?:au\s+sein\s+de\s+|affect(?:é|ée)\s+(?:(?:a|à)\s+|au\s+|aux\s+)|(?:a|à)\s+(?:l['’]|la\s+|le\s+|les\s+)?|au\s+|aux\s+|d['’]|de\s+(?:l['’]|la\s+|le\s+|les\s+)?|du\s+|des\s+|chez\s+|en\s+|dans\s+(?:l['’]|la\s+|le\s+|les\s+)?|sur\s+|sous\s+|près\s+de\s+)/i;

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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ");
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
    if (/^l['’]/i.test(trimmed)) return "de";
    if (/^le\s+/i.test(trimmed)) return "du";
    if (/^la\s+/i.test(trimmed)) return "de la";
    if (/^les\s+/i.test(trimmed)) return "des";
    return FRENCH_ELISION_START.test(trimmed) ? "d'" : "de";
  }

  if (PREFIXED_LOCATION.test(trimmed)) return "";

  if (kind === "institution") {
    if (/^l['’]/i.test(trimmed)) return "à";
    if (/^le\s+/i.test(trimmed)) return "au";
    if (/^la\s+/i.test(trimmed)) return "à la";
    if (/^les\s+/i.test(trimmed)) return "aux";

    const word = firstWord(trimmed);
    if (PLURAL_INSTITUTION_WORDS.has(word)) return "aux";
    if (FEMININE_INSTITUTION_WORDS.has(word)) return "à la";
    if (MASCULINE_INSTITUTION_WORDS.has(word)) return "au";
  }

  if (kind === "address") {
    if (/^le\s+/i.test(trimmed)) return "au";
    if (/^les\s+/i.test(trimmed)) return "aux";
    return "à";
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

export function stripSuggestionPrefix(value: string, kind: SuggestionPrefixKind) {
  const trimmed = value.trim();
  const pattern = kind === "position" ? PREFIXED_POSITION : PREFIXED_LOCATION;
  return trimmed.replace(pattern, "").trim();
}

function contractLeadingArticle(prefix: string, value: string) {
  const normalizedPrefix = normalizeSuggestionGrammarValue(prefix).replace(/[’]/g, "'");
  if (normalizedPrefix === "au" && /^le\s+/i.test(value)) {
    return value.replace(/^le\s+/i, "");
  }
  if (normalizedPrefix === "aux" && /^les\s+/i.test(value)) {
    return value.replace(/^les\s+/i, "");
  }
  if (normalizedPrefix === "a la" && /^la\s+/i.test(value)) {
    return value.replace(/^la\s+/i, "");
  }
  if (normalizedPrefix === "de la" && /^la\s+/i.test(value)) {
    return value.replace(/^la\s+/i, "");
  }
  if (normalizedPrefix === "du" && /^le\s+/i.test(value)) {
    return value.replace(/^le\s+/i, "");
  }
  if (normalizedPrefix === "des" && /^les\s+/i.test(value)) {
    return value.replace(/^les\s+/i, "");
  }
  return value;
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
  return joinSuggestionPrefix(prefix, contractLeadingArticle(prefix, trimmed));
}
