var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
export var LEGACY_MINISTER = {
    id: "bertrand-sinal",
    fullName: "Bertrand SINAL",
    gender: "Homme",
    nif: "003-888-685-8",
    ninu: "1009241060",
    mandateStartDate: "2020-01-01",
    mandateEndDate: null
};
export var MINISTRY_ADDRESS = "numéro 1 Rue Jacques Roumain, Maïs Gâté, Port-au-Prince";
export function validateMandate(start, end) {
    var mandateStartDate = (start === null || start === void 0 ? void 0 : start.trim()) || null;
    var mandateEndDate = (end === null || end === void 0 ? void 0 : end.trim()) || null;
    var valid = function (value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
            return false;
        var date = new Date("".concat(value, "T00:00:00Z"));
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (!mandateStartDate || !valid(mandateStartDate))
        throw new Error("Renseignez une date de début de mandat valide.");
    if (mandateEndDate && !valid(mandateEndDate))
        throw new Error("Renseignez une date de fin de mandat valide.");
    if (mandateEndDate && mandateEndDate < mandateStartDate)
        throw new Error("La fin du mandat ne peut pas précéder son début.");
    return { mandateStartDate: mandateStartDate, mandateEndDate: mandateEndDate };
}
export function validateMinister(input) {
    var _a, _b, _c;
    var fullName = (_a = input.fullName) === null || _a === void 0 ? void 0 : _a.trim().replace(/\s+/g, " ");
    var nif = (_b = input.nif) === null || _b === void 0 ? void 0 : _b.replace(/[\s-]/g, "");
    var ninu = (_c = input.ninu) === null || _c === void 0 ? void 0 : _c.trim();
    if (!input.id || input.id.length > 150)
        throw new Error("Identifiant du ministre invalide.");
    if (!fullName || fullName.length > 200)
        throw new Error("Le nom complet est obligatoire (200 caractères maximum).");
    if (input.gender !== "Homme" && input.gender !== "Femme")
        throw new Error("Sélectionnez le sexe du ministre.");
    if (!/^\d{10}$/.test(nif))
        throw new Error("Le NIF doit contenir 10 chiffres.");
    if (!/^\d{10}$/.test(ninu))
        throw new Error("Le NINU doit contenir 10 chiffres.");
    return __assign({ id: input.id, fullName: fullName, gender: input.gender, nif: nif.replace(/^(\d{3})(\d{3})(\d{3})(\d)$/, "$1-$2-$3-$4"), ninu: ninu }, validateMandate(input.mandateStartDate, input.mandateEndDate));
}
export function findContractMinister(contract, registry) {
    var _a;
    var id = contract.ministerId || LEGACY_MINISTER.id;
    var current = registry === null || registry === void 0 ? void 0 : registry.ministers.find(function (minister) { return minister.id === id; });
    if (current)
        return current;
    if (((_a = contract.minister) === null || _a === void 0 ? void 0 : _a.id) === id)
        return contract.minister;
    if (id === LEGACY_MINISTER.id)
        return LEGACY_MINISTER;
    return undefined;
}
export function isContractStartOutsideMandate(contractStartDate, minister) {
    // Compare calendar dates, without converting midnight through a time zone.
    return Boolean((minister.mandateStartDate && contractStartDate < minister.mandateStartDate)
        || (minister.mandateEndDate && contractStartDate > minister.mandateEndDate));
}
export function ministerTemplateVariables(minister) {
    var feminine = minister.gender === "Femme";
    var legacy = minister.id === LEGACY_MINISTER.id;
    return {
        minister_id: minister.id,
        minister_full_name: minister.fullName,
        minister_name: "".concat(legacy ? "Docteur" : feminine ? "Madame" : "Monsieur", " ").concat(minister.fullName),
        minister_signature: "".concat(legacy ? "Dr " : "").concat(minister.fullName),
        minister_nif: minister.nif,
        minister_ninu: minister.ninu,
        minister_gender: minister.gender,
        minister_address: MINISTRY_ADDRESS,
        minister_identified: feminine ? "identifiée" : "identifié",
        minister_domiciled: feminine ? "domiciliée" : "domicilié"
    };
}
