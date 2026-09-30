import { applySuggestionPrefix, joinSuggestionPrefix, normalizeSuggestionGrammarValue, stripSuggestionPrefix } from '../../lib/suggestionPrefixes';

export const INSTITUTION_PREPOSITION_FAMILIES = [
  { id: 'hospital', label: 'Hôpital', prefix: 'à l’', pattern: /^(?:hopital|hcr)\b/ },
  { id: 'health_centre', label: 'Centre de Santé', prefix: 'au', pattern: /^centre (?:de sante|communautaire de sante)\b/ },
  { id: 'hospital_centre', label: 'Centre Hospitalier', prefix: 'au', pattern: /^centre hospitalier\b/ },
  { id: 'social_medical_centre', label: 'Centre Médico-Social', prefix: 'au', pattern: /^centre medico[- ]social\b/ },
  { id: 'centre', label: 'Centre', prefix: 'au', pattern: /^centre\b/ },
  { id: 'department', label: 'Département Sanitaire', prefix: 'au', pattern: /^(?:departement|depatement)\b/ },
  { id: 'direction', label: 'Direction', prefix: 'à la', pattern: /^direction\b/ },
  { id: 'bureau', label: 'Bureau', prefix: 'au', pattern: /^bureau\b/ },
  { id: 'unit', label: 'Unité / UAS / UCS', prefix: 'à l’', pattern: /^(?:unite|uas|ucs)\b/ },
  { id: 'clinic', label: 'Clinique', prefix: 'à la', pattern: /^clinique\b/ },
  { id: 'maternity', label: 'Maternité', prefix: 'à la', pattern: /^maternite\b/ },
  { id: 'dispensary', label: 'Dispensaire', prefix: 'au', pattern: /^dispensaire\b/ },
  { id: 'sanatorium', label: 'Sanatorium', prefix: 'au', pattern: /^sanatorium\b/ },
  { id: 'brigade', label: 'Brigade', prefix: 'à la', pattern: /^brigade\b/ },
  { id: 'administration', label: 'Administration', prefix: 'à l’', pattern: /^administration\b/ },
  { id: 'society', label: 'Société / SONAPI', prefix: 'à la', pattern: /^(?:societe|sonapi)\b/ }
] as const;

export type InstitutionPrepositionRule = { family: string; prefix: string; version: number };
const remote = (import.meta.env.VITE_DATA_PROVIDER ?? 'local') === 'supabase';
const cacheKey = `contribution_institution_prepositions_v1:${remote ? 'remote' : 'local'}`;

export function defaultInstitutionPrepositions(): InstitutionPrepositionRule[] {
  return INSTITUTION_PREPOSITION_FAMILIES.map(({id, prefix}) => ({family:id, prefix, version:1}));
}

export function validateInstitutionPreposition(rule: InstitutionPrepositionRule) {
  if (!INSTITUTION_PREPOSITION_FAMILIES.some(f => f.id === rule.family)) throw new Error('Famille d’institution invalide.');
  if (typeof rule.prefix !== 'string' || !rule.prefix.trim() || rule.prefix.length > 50) throw new Error('Préposition invalide.');
  if (!Number.isInteger(rule.version) || rule.version < 1) throw new Error('Version invalide.');
}

export function readInstitutionPrepositions(): InstitutionPrepositionRule[] {
  try {
    const rules: unknown = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
    if (Array.isArray(rules)) {
      rules.forEach(validateInstitutionPreposition);
      return defaultInstitutionPrepositions().map(rule => rules.find(r => r.family === rule.family) ?? rule);
    }
  } catch { /* Use the common defaults when no valid cache is available. */ }
  return defaultInstitutionPrepositions();
}

export function cacheInstitutionPrepositions(rules: InstitutionPrepositionRule[]) {
  try { localStorage.setItem(cacheKey, JSON.stringify(rules)); } catch { /* The server remains authoritative. */ }
}

export function institutionPrepositionFamily(value: string) {
  const name = normalizeSuggestionGrammarValue(stripSuggestionPrefix(value, 'institution')).replace(/^(?:l'|le |la |les )/, '');
  return INSTITUTION_PREPOSITION_FAMILIES.find(f => f.pattern.test(name));
}

export function formatInstitutionAssignment(value: string, rules = readInstitutionPrepositions(), legacyPrefix?: string | null) {
  const family = institutionPrepositionFamily(value);
  if (!family) return applySuggestionPrefix(value, 'institution', legacyPrefix);
  const prefix = rules.find(r => r.family === family.id)?.prefix ?? family.prefix;
  const label = stripSuggestionPrefix(value, 'institution').replace(/^(?:l['’]|le\s+|la\s+)/i, '');
  return joinSuggestionPrefix(prefix, label);
}
