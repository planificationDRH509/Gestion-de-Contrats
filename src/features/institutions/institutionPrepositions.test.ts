import { beforeEach, describe, expect, it } from 'vitest';
import { cacheInstitutionPrepositions, defaultInstitutionPrepositions, formatInstitutionAssignment, institutionPrepositionFamily, readInstitutionPrepositions } from './institutionPrepositions';

describe('common institution prepositions', () => {
  beforeEach(() => localStorage.clear());
  it('shares a hospital rule across hospital categories and existing manual prefixes', () => {
    const rules = defaultInstitutionPrepositions().map(rule => rule.family==='hospital' ? {...rule,prefix:'au sein de l’'} : rule);
    for (const name of ['Hôpital Saint-Antoine','Hôpital Universitaire La Paix','Hôpital Communautaire de Référence de Port-Salut','à l’Hôpital Saint-Antoine','l’Hôpital Saint-Antoine']) {
      expect(formatInstitutionAssignment(name,rules,'à')).toBe(`au sein de l’${name.replace(/^(?:à l’|l’)/,'')}`);
    }
    expect(formatInstitutionAssignment('Centre de Santé de Carradeux',rules)).toBe('au Centre de Santé de Carradeux');
  });
  it('separates grammar families even when they share an administrative type', () => {
    expect(formatInstitutionAssignment('Département Sanitaire du Sud')).toBe('au Département Sanitaire du Sud');
    expect(formatInstitutionAssignment('Direction Sanitaire du Sud-Est')).toBe('à la Direction Sanitaire du Sud-Est');
    expect(formatInstitutionAssignment('Bureau Départemental du Centre')).toBe('au Bureau Départemental du Centre');
    expect(institutionPrepositionFamily('Centre Médico-Social de Gebeau')?.id).toBe('social_medical_centre');
    expect(institutionPrepositionFamily('Centre Hospitalier de Kenscoff')?.id).toBe('hospital_centre');
    expect(institutionPrepositionFamily('Centre Communautaire de Santé de Duchity')?.id).toBe('health_centre');
  });
  it('recomposes articles and existing prepositions only once', () => {
    expect(formatInstitutionAssignment('Le Centre de Santé de Test')).toBe('au Centre de Santé de Test');
    expect(formatInstitutionAssignment('au sein du Département Sanitaire du Sud')).toBe('au Département Sanitaire du Sud');
    expect(formatInstitutionAssignment('La Direction Sanitaire')).toBe('à la Direction Sanitaire');
    expect(formatInstitutionAssignment('Hôpitaux Universitaires')).toBe('aux Hôpitaux Universitaires');
  });
  it('persists common rules and safely recovers from invalid cached values', () => {
    const rules=defaultInstitutionPrepositions().map(rule => rule.family==='department' ? {...rule,prefix:'au sein du',version:2} : rule);
    cacheInstitutionPrepositions(rules);
    expect(formatInstitutionAssignment('Département Sanitaire du Sud')).toBe('au sein du Département Sanitaire du Sud');
    expect(readInstitutionPrepositions()).toEqual(rules);
    cacheInstitutionPrepositions([{family:'department',prefix:'',version:1}]);
    expect(formatInstitutionAssignment('Département Sanitaire du Sud')).toBe('au Département Sanitaire du Sud');
  });
});
