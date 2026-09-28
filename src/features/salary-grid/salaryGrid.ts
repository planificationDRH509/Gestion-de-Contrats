import type { PositionSuggestion } from '../../data/local/suggestionsDb';
import { normalizeSuggestionGrammarValue, stripSuggestionPrefix } from '../../lib/suggestionPrefixes';

export type SalaryGridEntry = {
  id: string;
  masculine: string;
  feminine: string;
  category: string;
  jobType: string;
  salaries: number[];
  aliases: string[];
  source: string;
  sourceRows: number[];
  notes: string;
  active: boolean;
  version: number;
};
export const normalizeTitle = (value: string) => normalizeSuggestionGrammarValue(stripSuggestionPrefix(value, 'position').replace(/[-‐‑–]/g, ' ').replace(/\./g, ''))
  .replace(/\s+(iv|iii|ii|i)$/, (_, roman: string) => ` ${['i', 'ii', 'iii', 'iv'].indexOf(roman) + 1}`)
  .replace(/\s+(?:s|senior)\s*\(?([1-4])\)?$/, ' senior $1')
  .replace(/\s+(?:j|junior)\s*\(?([1-4])\)?$/, ' junior $1')
  .replace(/\s+\(([1-4])\)$/, ' $1');
export const contractTitleWithoutGrade = (title: string) => title.trim()
  .replace(/\s+S\.[1-4]$/i, ' Senior')
  .replace(/\s+J\.[1-4]$/i, ' Junior')
  .replace(/\s+(?:[1-4]|\([1-4]\))$/, '');
export function matchingEntries(entries: SalaryGridEntry[], title: string) {
  const key = normalizeTitle(title);
  return key ? entries.filter(e => e.active && [e.masculine, e.feminine, ...e.aliases].some(v => normalizeTitle(v) === key)) : [];
}
export function genderedTitle(entries: SalaryGridEntry[], title: string, gender: string) {
  if (gender !== 'Femme' && gender !== 'Homme') return title;
  const entry = matchingEntries(entries, title)[0];
  return entry ? (gender === 'Femme' ? entry.feminine : entry.masculine) : title;
}
export function approvedSalaries(entries: SalaryGridEntry[], title: string) {
  const exact = matchingEntries(entries, title);
  let reference = exact;
  if (!reference.length) {
    const key = normalizeTitle(title)
      .replace(/^agents? administrarif/, 'commis administratif')
      .replace(/^agente?s? administrati(?:f|ve)s?/, 'commis administratif');
    const numbered = /\s+[1-4]$/.test(key);
    reference = entries.filter(entry => entry.active && [entry.masculine, entry.feminine, ...entry.aliases].some(value => {
      const candidate = normalizeTitle(value);
      return candidate === key || (!numbered && candidate.replace(/\s+[1-4]$/, '') === key);
    }));
    if (!reference.length) {
      const level = key.match(/\s+(senior|junior)(?: ([1-4]))?$/);
      if (level) {
        const base = key.slice(0, level.index);
        const baseTypes = [...new Set(matchingEntries(entries, base).map(entry => entry.jobType))];
        const jobType = /\btechnicien(?:ne)?\b|\btechnique\b/.test(base) ? 'Technique'
          : baseTypes.length === 1 ? baseTypes[0] : undefined;
        reference = entries.filter(entry => entry.active && (!jobType || entry.jobType === jobType) &&
          [entry.masculine, entry.feminine, ...entry.aliases].some(value => {
            const candidate = normalizeTitle(value).match(/\s+(senior|junior)(?: ([1-4]))?$/);
            return candidate?.[1] === level[1] && (!level[2] || candidate[2] === level[2]);
          }));
      }
    }
  }
  return [...new Set(reference.flatMap(e => e.salaries))].sort((a,b) => a-b);
}
export function salaryOutsideGrid(entries: SalaryGridEntry[], title: string, salary: number) {
  return Boolean(title.trim()) && Number.isFinite(salary) && salary > 0 &&
    !approvedSalaries(entries, title).some(value => Math.round(value * 100) === Math.round(salary * 100));
}
export function gridPositions(entries: SalaryGridEntry[], gender = ''): PositionSuggestion[] {
  return entries.filter(e => e.active).map((e, order) => ({
    id: e.id, label: gender === 'Femme' ? e.feminine : e.masculine,
    labelFeminine: e.feminine, salaries: e.salaries, order
  }));
}
export function validateGridEntry(entry: SalaryGridEntry) {
  if (!entry.masculine.trim() || !entry.feminine.trim() || !entry.category.trim()) throw new Error('Renseignez les deux titres et le type de personnel.');
  if (entry.jobType !== 'Universitaire' && entry.jobType !== 'Technique') throw new Error('Choisissez un type de poste.');
  if (!entry.salaries.length || entry.salaries.some(s => !Number.isFinite(s) || s <= 0 || Math.abs(s * 100 - Math.round(s * 100)) > 0.00001)) throw new Error('Renseignez des salaires positifs, avec deux décimales au maximum.');
  return entry;
}
