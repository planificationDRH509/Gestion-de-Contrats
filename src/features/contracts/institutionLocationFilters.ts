import type { InstitutionSuggestion } from "../../data/local/suggestionsDb";

export const NO_MATCHING_INSTITUTION_ASSIGNMENT =
  "__contribution_no_matching_institution_location__";

function normalizeLocationValue(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

function uniqueSortedValues(values: Array<string | null | undefined>) {
  const byNormalizedValue = new Map<string, string>();

  values.forEach((value) => {
    const trimmed = value?.trim();
    const normalized = normalizeLocationValue(trimmed);
    if (trimmed && normalized && !byNormalizedValue.has(normalized)) {
      byNormalizedValue.set(normalized, trimmed);
    }
  });

  return Array.from(byNormalizedValue.values()).sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" })
  );
}

export function getInstitutionDepartmentOptions(institutions: InstitutionSuggestion[]) {
  return uniqueSortedValues(institutions.map((institution) => institution.department));
}

export function getInstitutionCommuneOptions(institutions: InstitutionSuggestion[]) {
  return uniqueSortedValues(institutions.map((institution) => institution.commune));
}

export function getAssignmentsForInstitutionLocation(
  institutions: InstitutionSuggestion[],
  departments: string[],
  communes: string[]
) {
  if (departments.length === 0 && communes.length === 0) {
    return undefined;
  }

  const normalizedDepartments = new Set(departments.map(normalizeLocationValue));
  const normalizedCommunes = new Set(communes.map(normalizeLocationValue));

  return institutions
    .filter((institution) => {
      const department = normalizeLocationValue(institution.department);
      const commune = normalizeLocationValue(institution.commune);
      return (
        (normalizedDepartments.size === 0 || normalizedDepartments.has(department)) &&
        (normalizedCommunes.size === 0 || normalizedCommunes.has(commune))
      );
    })
    .map((institution) => institution.label);
}

export function combineAssignmentAndInstitutionLocationFilters(
  institutions: InstitutionSuggestion[],
  assignments: string[],
  departments: string[],
  communes: string[]
) {
  const locationAssignments = getAssignmentsForInstitutionLocation(
    institutions,
    departments,
    communes
  );

  if (!locationAssignments) {
    return assignments.length > 0 ? assignments : undefined;
  }

  const normalizedLocationAssignments = new Set(
    locationAssignments.map(normalizeLocationValue)
  );
  const candidates = assignments.length > 0 ? assignments : locationAssignments;
  const matchingAssignments = candidates.filter((assignment) =>
    normalizedLocationAssignments.has(normalizeLocationValue(assignment))
  );

  return matchingAssignments.length > 0
    ? matchingAssignments
    : [NO_MATCHING_INSTITUTION_ASSIGNMENT];
}

export function contractMatchesInstitutionLocation(
  assignment: string,
  institutions: InstitutionSuggestion[],
  departments: string[],
  communes: string[]
) {
  const locationAssignments = getAssignmentsForInstitutionLocation(
    institutions,
    departments,
    communes
  );

  if (!locationAssignments) return true;

  const normalizedAssignment = normalizeLocationValue(assignment);
  return locationAssignments.some(
    (institutionAssignment) =>
      normalizeLocationValue(institutionAssignment) === normalizedAssignment
  );
}

export function createInstitutionLocationMatcher(
  institutions: InstitutionSuggestion[],
  departments: string[],
  communes: string[]
) {
  const locationAssignments = getAssignmentsForInstitutionLocation(
    institutions,
    departments,
    communes
  );

  if (!locationAssignments) {
    return (_assignment: string) => true;
  }

  const normalizedAssignments = new Set(
    locationAssignments.map(normalizeLocationValue)
  );
  return (assignment: string) =>
    normalizedAssignments.has(normalizeLocationValue(assignment));
}
