import { describe, expect, it } from 'vitest';
import seed from './salaryGridSeed.json';
import { approvedSalaries, contractTitleWithoutGrade, genderedTitle, gridPositions, matchingEntries, salaryOutsideGrid, validateGridEntry } from './salaryGrid';

describe('salary reference', () => {
  it('uses April 2022 salaries and excludes teachers and police', () => {
    expect(seed).toHaveLength(141);
    expect(seed.filter(e => e.active)).toHaveLength(136);
    expect(seed.some(e => /policier|enseignant/i.test(e.category))).toBe(false);
    expect(approvedSalaries(seed, 'Infirmière de ligne')).toEqual([37200]);
    expect(salaryOutsideGrid(seed, 'Infirmier de ligne', 27500)).toBe(true);
  });
  it('matches feminine, accents, aliases and prefixes without confusing grades', () => {
    expect(approvedSalaries(seed, "d’infirmière spécialiste")).toEqual([41700]);
    expect(approvedSalaries(seed, 'OPERATEUR INFORMATIQUE 3')).toEqual([28700]);
    expect(approvedSalaries(seed, 'Opér. Inf. 3')).toEqual([28700]);
    expect(approvedSalaries(seed, 'Auxiliaire-Infirmière')).toEqual([31900]);
    expect(salaryOutsideGrid(seed, 'Opérateur informatique 2', 28700)).toBe(true);
  });
  it('accepts multiple explicitly listed salaries and flags unknown titles', () => {
    expect(approvedSalaries(seed, 'Ingénieur')).toEqual([75000,86400]);
    expect(salaryOutsideGrid(seed, 'Ingénieure', 75000)).toBe(false);
    expect(salaryOutsideGrid(seed, 'Ingénieur', 75500)).toBe(true);
    expect(salaryOutsideGrid(seed, 'Titre libre', 50000)).toBe(true);
    expect(salaryOutsideGrid(seed, '', 0)).toBe(false);
  });
  it('switches in both directions and preserves unknown titles', () => {
    expect(genderedTitle(seed, 'Pharmacien','Femme')).toBe('Pharmacienne');
    expect(genderedTitle(seed, 'Pharmacienne','Homme')).toBe('Pharmacien');
    expect(genderedTitle(seed, 'Infirmière de ligne','Homme')).toBe('Infirmier de ligne');
    expect(gridPositions(seed).some(e => e.label === 'Opérateur informatique 3')).toBe(true);
    expect(genderedTitle(seed, 'Titre libre','Femme')).toBe('Titre libre');
    expect(gridPositions(seed,'Femme').some(e => e.label==='Pharmacienne')).toBe(true);
  });
  it('does not approve undated handwritten amounts', () => {
    expect(matchingEntries(seed, 'Magasinière')).toEqual([]);
    expect(salaryOutsideGrid(seed, 'Magasinier',26850)).toBe(true);
  });
  it('omits grade numbers only from document titles', () => {
    expect(contractTitleWithoutGrade('Secrétaire de Direction 1')).toBe('Secrétaire de Direction');
    expect(contractTitleWithoutGrade('Économiste S.3')).toBe('Économiste Senior');
    expect(contractTitleWithoutGrade('Comptable J.2')).toBe('Comptable Junior');
    expect(contractTitleWithoutGrade('Médecin Généraliste')).toBe('Médecin Généraliste');
  });
  it('reflects edits, deactivation and additional approved salaries immediately', () => {
    const entry=seed.find(e => e.masculine==='Pharmacien')!;
    const updated=[{...entry,salaries:[41000,42000]}];
    expect(salaryOutsideGrid(updated,'Pharmacienne',40000)).toBe(true);
    expect(salaryOutsideGrid(updated,'Pharmacien',42000)).toBe(false);
    expect(approvedSalaries([{...entry,active:false}],'Pharmacien')).toEqual([]);
    expect(() => validateGridEntry({...entry,salaries:[0]})).toThrow();
    expect(validateGridEntry({...entry,active:true})).toMatchObject({active:true});
  });
});
