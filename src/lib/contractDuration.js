export var CONTRACT_DURATION_ERROR = "La durée doit être un nombre entier de 1 à 12 mois.";
export function assertContractDuration(value) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 12) {
        throw new Error(CONTRACT_DURATION_ERROR);
    }
}
