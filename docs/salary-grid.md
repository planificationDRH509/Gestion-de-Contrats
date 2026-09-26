# Grille Salariale

The national grid is shared across workspaces. `public.salary_grid` is read through
`read_salary_grid` using the existing application session. Only administrators can
write through `save_salary_grid_entry`; direct table access is revoked and RLS is
on. Versions reject stale writes. The migration is already applied to the linked
Supabase project.

Source: `Grille_salariale_Haiti_mai_2022.xlsx`, column F (April 2022), not column D
(October 2020). Teacher and police categories are excluded. Grouped titles are
split, abbreviations receive explicit aliases, and repeated titles retain each
printed salary. Catch-all descriptions and “Salaire Minimum” are not job titles.
136 active titles were imported. Five undated handwritten entries are inactive
until reviewed and activated. Source row numbers and uncertainty notes are
preserved. The source does not establish a newer national schedule than 2022.

The manager edits masculine/feminine titles, category, approved amounts, aliases
and active status. Renaming a title retains its previous spellings as aliases.
Forms, spreadsheet entry, import previews and the contract list flag
positive amounts outside the approved values in red without blocking an override.
Contract entry never learns an override as an approved salary. Unknown titles also
remain unapproved. Gender normalization applies in entry, documents and export.

Offline reads use the last fetched grid; remote edits require connectivity. No
remote fallback silently treats bundled seed values as a successfully loaded grid.

Checks: `src/features/salary-grid/salaryGrid.test.ts`,
`tests/browser/salary-grid.spec.ts`, and `supabase/tests/salary_grid.sql` (transaction
rolled back, covers valid/invalid sessions, role access, edits and version conflicts).
