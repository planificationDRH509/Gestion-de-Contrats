import {describe,expect,it} from 'vitest';
import {inferInstitutionType,normalizeInstitution,validateInstitution,type InstitutionSuggestion} from './institutions';

describe('institution references',() => {
  const entry:InstitutionSuggestion={id:'new',label:'Centre de Santé de Tabarre',institutionType:'Centre de Santé',department:'Ouest',commune:'Tabarre',addressKeywords:[],order:0,version:0};
  it('rejects accent, punctuation and case variants of the same institution',() => {
    expect(normalizeInstitution(' HÔPITAL Saint-Antoine ')).toBe(normalizeInstitution('hopital saint antoine'));
    expect(() => validateInstitution({...entry,id:'another',label:'centre de sante de tabarre'},[entry])).toThrow('existe déjà');
    expect(() => validateInstitution(entry,[entry])).not.toThrow();
  });
  it('keeps ambiguous names unclassified and distinguishes hospital categories',() => {
    expect(inferInstitutionType('Hôpital Communautaire de Référence de Port-Salut')).toBe('HCR');
    expect(inferInstitutionType('Hôpital Universitaire La Paix')).toBe('Hôpital Universitaire');
    expect(inferInstitutionType('Bureau Communal Sanitaire de Delmas')).toBe('Bureau Communal');
    expect(inferInstitutionType('Centre Multifonctionnel CODEC')).toBeNull();
  });
  it('rejects incomplete or unsupported locations and types',() => {
    expect(() => validateInstitution({...entry,department:null},[])).toThrow('département');
    expect(() => validateInstitution({...entry,department:'Province'},[])).toThrow('Département invalide');
    expect(() => validateInstitution({...entry,institutionType:'Inconnu'},[])).toThrow('type');
  });
});
