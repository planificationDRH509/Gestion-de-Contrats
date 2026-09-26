import seed from './salaryGridSeed.json';
import type { SalaryGridEntry } from './salaryGrid';
export const salaryGridRemote = (import.meta.env.VITE_DATA_PROVIDER ?? 'local') === 'supabase';
const cacheKey = `contribution_salary_grid_v1:${salaryGridRemote ? 'remote' : 'local'}`;
export function readSalaryGridCache(): SalaryGridEntry[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return salaryGridRemote ? undefined : seed;
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every(e => e && typeof e.id === 'string' && typeof e.masculine === 'string' && typeof e.feminine === 'string' && typeof e.category === 'string' && Array.isArray(e.salaries) && Array.isArray(e.aliases))) return undefined;
    return value;
  } catch { return undefined; }
}
export function cacheSalaryGrid(entries: SalaryGridEntry[]) {
  try { localStorage.setItem(cacheKey, JSON.stringify(entries)); } catch { /* Server remains authoritative. */ }
}
