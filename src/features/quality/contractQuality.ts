import type { Contract } from "../../data/types";
import type { PositionSuggestion } from "../../data/local/suggestionsDb";
import { formatFirstName, formatLastName } from "../../lib/format";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";

export type QualitySeverity = "critical" | "warning" | "info";

export type QualityIdentity = {
  nif: string;
  ninu: string | null;
  nom: string;
  prenom: string;
  adresse: string;
};

export type QualityIssue = {
  id: string;
  severity: QualitySeverity;
  code:
    | "invalid_nif"
    | "invalid_ninu"
    | "duplicate_ninu"
    | "missing_required"
    | "invalid_salary"
    | "salary_text_mismatch"
    | "salary_not_allowed"
    | "invalid_duration"
    | "name_format"
    | "orphan_contract"
    | "exact_duplicate"
    | "missing_dossier";
  entity: "contract" | "identification";
  entityId: string;
  contractId?: string;
  personName: string;
  title: string;
  detail: string;
  autoFix?: {
    field: "salaryText";
    value: string;
  };
};

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fiscalYearKey(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

function makeId(parts: Array<string | number>) {
  return parts.join(":");
}

export function analyzeContractQuality({
  contracts,
  identities,
  positions
}: {
  contracts: Contract[];
  identities: QualityIdentity[];
  positions: PositionSuggestion[];
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const identitiesByNif = new Map(identities.map((identity) => [identity.nif, identity]));
  const salariesByPosition = new Map(
    positions.map((position) => [
      normalizedText(position.label),
      (position.salaries ?? []).filter((salary) => Number.isFinite(salary) && salary > 0)
    ])
  );

  for (const identity of identities) {
    const personName = `${identity.prenom} ${identity.nom}`.trim();
    if (!/^\d{3}-\d{3}-\d{3}-\d$/.test(identity.nif)) {
      issues.push({
        id: makeId(["identification", identity.nif, "invalid_nif"]),
        severity: "critical",
        code: "invalid_nif",
        entity: "identification",
        entityId: identity.nif,
        personName,
        title: "Format NIF invalide",
        detail: "Le NIF doit respecter le format XXX-XXX-XXX-X."
      });
    }
    if (identity.ninu && !/^\d{10}$/.test(identity.ninu)) {
      issues.push({
        id: makeId(["identification", identity.nif, "invalid_ninu"]),
        severity: "warning",
        code: "invalid_ninu",
        entity: "identification",
        entityId: identity.nif,
        personName,
        title: "Format NINU invalide",
        detail: "Le NINU renseigné doit contenir exactement 10 chiffres."
      });
    }
    if (!identity.nom.trim() || !identity.prenom.trim() || !identity.adresse.trim()) {
      issues.push({
        id: makeId(["identification", identity.nif, "missing_required"]),
        severity: "critical",
        code: "missing_required",
        entity: "identification",
        entityId: identity.nif,
        personName,
        title: "Identification incomplète",
        detail: "Le nom, le prénom et l’adresse sont obligatoires."
      });
    }
  }

  const ninuGroups = new Map<string, QualityIdentity[]>();
  for (const identity of identities) {
    if (!identity.ninu) continue;
    const group = ninuGroups.get(identity.ninu) ?? [];
    group.push(identity);
    ninuGroups.set(identity.ninu, group);
  }
  for (const [ninu, group] of ninuGroups) {
    const nifs = new Set(group.map((identity) => identity.nif));
    if (nifs.size <= 1) continue;
    for (const identity of group) {
      issues.push({
        id: makeId(["identification", identity.nif, "duplicate_ninu"]),
        severity: "critical",
        code: "duplicate_ninu",
        entity: "identification",
        entityId: identity.nif,
        personName: `${identity.prenom} ${identity.nom}`.trim(),
        title: "NINU utilisé plusieurs fois",
        detail: `Le NINU ${ninu} est associé à ${nifs.size} NIF différents.`
      });
    }
  }

  for (const contract of contracts) {
    const personName = `${contract.firstName} ${contract.lastName}`.trim();
    const nif = contract.nif?.trim() || "";
    if (!/^\d{3}-\d{3}-\d{3}-\d$/.test(nif)) {
      issues.push({
        id: makeId(["contract", contract.id, "invalid_nif"]),
        severity: "critical",
        code: "invalid_nif",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName,
        title: "NIF du contrat invalide",
        detail: "Le contrat ne possède pas un NIF au format XXX-XXX-XXX-X."
      });
    }
    if (nif && !identitiesByNif.has(nif)) {
      issues.push({
        id: makeId(["contract", contract.id, "orphan_contract"]),
        severity: "critical",
        code: "orphan_contract",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName,
        title: "Identification introuvable",
        detail: "Aucune fiche d’identification active ne correspond au NIF du contrat."
      });
    }
    const missingFields = [
      !contract.firstName.trim() ? "prénom" : "",
      !contract.lastName.trim() ? "nom" : "",
      !contract.address.trim() ? "adresse" : "",
      !contract.position.trim() ? "poste" : "",
      !contract.assignment.trim() ? "affectation" : ""
    ].filter(Boolean);
    if (missingFields.length > 0) {
      issues.push({
        id: makeId(["contract", contract.id, "missing_required"]),
        severity: "critical",
        code: "missing_required",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName,
        title: "Contrat incomplet",
        detail: `Champs manquants : ${missingFields.join(", ")}.`
      });
    }
    if (!Number.isFinite(contract.salaryNumber) || contract.salaryNumber <= 0) {
      issues.push({
        id: makeId(["contract", contract.id, "invalid_salary"]),
        severity: "critical",
        code: "invalid_salary",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName,
        title: "Salaire invalide",
        detail: "Le salaire doit être un montant strictement positif."
      });
    } else {
      const expectedSalaryText = numberToFrenchWords(contract.salaryNumber);
      if (
        contract.salaryText.trim() &&
        normalizedText(contract.salaryText) !== normalizedText(expectedSalaryText)
      ) {
        issues.push({
          id: makeId(["contract", contract.id, "salary_text_mismatch"]),
          severity: "warning",
          code: "salary_text_mismatch",
          entity: "contract",
          entityId: contract.id,
          contractId: contract.id,
          personName,
          title: "Salaire en lettres incohérent",
          detail: `Valeur attendue : « ${expectedSalaryText} ».`,
          autoFix: { field: "salaryText", value: expectedSalaryText }
        });
      }

      const allowedSalaries = salariesByPosition.get(normalizedText(contract.position)) ?? [];
      if (
        allowedSalaries.length > 0 &&
        !allowedSalaries.some((salary) => Math.abs(salary - contract.salaryNumber) < 0.01)
      ) {
        issues.push({
          id: makeId(["contract", contract.id, "salary_not_allowed"]),
          severity: "warning",
          code: "salary_not_allowed",
          entity: "contract",
          entityId: contract.id,
          contractId: contract.id,
          personName,
          title: "Salaire inhabituel pour ce poste",
          detail: `Montants configurés : ${allowedSalaries.map((salary) => salary.toLocaleString("fr-HT")).join(", ")} HTG.`
        });
      }
    }
    if (
      !Number.isInteger(contract.durationMonths) ||
      contract.durationMonths < 1 ||
      contract.durationMonths > 12
    ) {
      issues.push({
        id: makeId(["contract", contract.id, "invalid_duration"]),
        severity: "warning",
        code: "invalid_duration",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName,
        title: "Durée inhabituelle",
        detail: "La durée attendue doit être comprise entre 1 et 12 mois."
      });
    }
    if (
      contract.firstName !== formatFirstName(contract.firstName) ||
      contract.lastName !== formatLastName(contract.lastName)
    ) {
      issues.push({
        id: makeId(["contract", contract.id, "name_format"]),
        severity: "info",
        code: "name_format",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName,
        title: "Présentation du nom à normaliser",
        detail: "Le nom doit être en majuscules et le prénom en casse titre."
      });
    }
    if (!contract.dossierId) {
      issues.push({
        id: makeId(["contract", contract.id, "missing_dossier"]),
        severity: "info",
        code: "missing_dossier",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName,
        title: "Contrat sans dossier",
        detail: "Le contrat n’est rattaché à aucun dossier."
      });
    }
  }

  const duplicateGroups = new Map<string, Contract[]>();
  for (const contract of contracts) {
    const key = [
      contract.nif,
      normalizedText(contract.position),
      normalizedText(contract.assignment),
      contract.salaryNumber,
      fiscalYearKey(contract.createdAt)
    ].join("|");
    const group = duplicateGroups.get(key) ?? [];
    group.push(contract);
    duplicateGroups.set(key, group);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length <= 1) continue;
    for (const contract of group) {
      issues.push({
        id: makeId(["contract", contract.id, "exact_duplicate"]),
        severity: "warning",
        code: "exact_duplicate",
        entity: "contract",
        entityId: contract.id,
        contractId: contract.id,
        personName: `${contract.firstName} ${contract.lastName}`.trim(),
        title: "Doublon potentiel",
        detail: `${group.length} contrats ont le même NIF, poste, affectation et salaire pour la même année fiscale.`
      });
    }
  }

  const severityOrder: Record<QualitySeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2
  };
  return issues.sort((left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity] ||
    left.personName.localeCompare(right.personName)
  );
}
