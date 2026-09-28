export var INSTITUTION_TYPES = [
    'Centre de Santé', 'Hôpital', 'Hôpital Universitaire',
    'HCR', 'Centre Hospitalier', 'Centre Médico-Social', 'Dispensaire',
    'Clinique', 'Maternité', 'Bureau Administratif', 'Bureau Départemental',
    'Bureau Communal', 'Bureau Central', 'UAS / UCS', 'Autre'
];
export var DEPARTMENTS = ['Artibonite', 'Centre', "Grand’Anse", 'Nippes', 'Nord', 'Nord-Est', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Est'];
export function normalizeInstitution(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
}
// Only explicit wording is classified; ambiguous names remain unclassified.
export function inferInstitutionType(label) {
    var name = normalizeInstitution(label);
    if (/^(hopital communautaire de reference|hcr)\b/.test(name))
        return 'HCR';
    if (/^hopital universitaire\b/.test(name) || name.includes('universite d etat'))
        return 'Hôpital Universitaire';
    if (/^hopital\b/.test(name))
        return 'Hôpital';
    if (/^centre hospitalier\b/.test(name))
        return 'Centre Hospitalier';
    if (/^centre medico social\b/.test(name))
        return 'Centre Médico-Social';
    if (/^centre (de sante|communautaire de sante)\b/.test(name))
        return 'Centre de Santé';
    if (/^dispensaire\b/.test(name))
        return 'Dispensaire';
    if (/^clinique\b/.test(name))
        return 'Clinique';
    if (/^(maternite|centre materno)\b/.test(name))
        return 'Maternité';
    if (/^(uas|ucs)\b/.test(name) || /^bureau de l uas\b/.test(name))
        return 'UAS / UCS';
    if (/departement(al|aux)?|departement sanitaire|direction sanitaire/.test(name))
        return 'Bureau Départemental';
    if (/^bureau (communal|de la commune)\b/.test(name))
        return 'Bureau Communal';
    if (/^bureau central\b/.test(name) || name === 'bureau du ministre')
        return 'Bureau Central';
    return null;
}
export function institutionType(entry) {
    var _a;
    return (_a = entry.institutionType) !== null && _a !== void 0 ? _a : inferInstitutionType(entry.label);
}
export function validateInstitution(entry, entries) {
    var _a, _b;
    if (!entry.label.trim() || entry.label.trim().length > 250)
        throw new Error('Nom d’institution invalide.');
    if (!entry.institutionType || !INSTITUTION_TYPES.includes(entry.institutionType))
        throw new Error('Choisissez un type d’institution.');
    if (entry.department && !DEPARTMENTS.some(function (d) { return normalizeInstitution(d) === normalizeInstitution(entry.department); }))
        throw new Error('Département invalide.');
    if (entry.commune && !entry.department)
        throw new Error('Choisissez le département de cette commune.');
    if (((_b = (_a = entry.commune) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 150)
        throw new Error('Nom de commune trop long.');
    if (entry.source && !/^https?:\/\//i.test(entry.source))
        throw new Error('Adresse de source invalide.');
    if (entries.some(function (e) { return e.id !== entry.id && normalizeInstitution(e.label) === normalizeInstitution(entry.label); }))
        throw new Error('Cette institution existe déjà.');
}
