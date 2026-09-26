import type { PositionSuggestion } from '../../data/local/suggestionsDb';
import { normalizeSuggestionGrammarValue, stripSuggestionPrefix } from '../../lib/suggestionPrefixes';

export type SalaryGridEntry = {
  id: string;
  masculine: string;
  feminine: string;
  category: string;
  salaries: number[];
  aliases: string[];
  source: string;
  sourceRows: number[];
  notes: string;
  active: boolean;
  version: number;
};
export const normalizeTitle = (value: string) => normalizeSuggestionGrammarValue(stripSuggestionPrefix(value, 'position').replace(/[-‐‑–]/g, ' ').replace(/\./g, ''));
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
  return [...new Set(matchingEntries(entries, title).flatMap(e => e.salaries))].sort((a,b) => a-b);
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
  if (!entry.salaries.length || entry.salaries.some(s => !Number.isFinite(s) || s <= 0 || Math.abs(s * 100 - Math.round(s * 100)) > 0.00001)) throw new Error('Renseignez des salaires positifs, avec deux décimales au maximum.');
  return entry;
}
