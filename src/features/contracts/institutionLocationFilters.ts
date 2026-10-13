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

export function getInstitutionCommuneOptions(institutions: InstitutionSuggestion[], departments: string[] = []) {
  const normalizedDepartments = new Set(departments.map(normalizeLocationValue));
  return uniqueSortedValues(institutions
    .filter(institution => normalizedDepartments.size === 0 || normalizedDepartments.has(normalizeLocationValue(institution.department)))
    .map((institution) => institution.commune));
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

export type InstitutionFilterSelection = {
  institution: string[];
  department: string[];
  commune: string[];
};

type InstitutionFilterKey = keyof InstitutionFilterSelection;
const locationKeys: InstitutionFilterKey[] = ["institution", "department", "commune"];
const locationValue = (institution: InstitutionSuggestion, key: InstitutionFilterKey) =>
  key === "institution" ? institution.label : institution[key];

function matchesLocationSelection(institution: InstitutionSuggestion, selection: InstitutionFilterSelection, except?: InstitutionFilterKey) {
  return locationKeys.every(key => key === except || selection[key].length === 0 ||
    selection[key].some(value => normalizeLocationValue(value) === normalizeLocationValue(locationValue(institution, key))));
}

export function getLinkedInstitutionFilters(institutions: InstitutionSuggestion[], selection: InstitutionFilterSelection) {
  const field = (key: InstitutionFilterKey) => {
    const candidates = institutions.filter(institution => matchesLocationSelection(institution, selection, key));
    const options = uniqueSortedValues(candidates.map(institution => locationValue(institution, key)));
    const hasOtherSelection = locationKeys.some(other => other !== key && selection[other].length > 0);
    const determined = selection[key].length === 0 && hasOtherSelection && options.length === 1 &&
      candidates.every(institution => Boolean(normalizeLocationValue(locationValue(institution, key))));
    return { options, disabled: determined, values: determined ? options : selection[key] };
  };
  return { institution: field("institution"), department: field("department"), commune: field("commune") };
}

export function updateInstitutionFilterSelection(
  institutions: InstitutionSuggestion[], selection: InstitutionFilterSelection, key: InstitutionFilterKey, values: string[]
): InstitutionFilterSelection {
  const next = { ...selection, [key]: values };
  if (values.length === 0) return next;
  const candidates = institutions.filter(institution => matchesLocationSelection(institution, next));
  for (const other of locationKeys) {
    if (other === key) continue;
    const supported = new Set(candidates.map(institution => normalizeLocationValue(locationValue(institution, other))));
    next[other] = next[other].filter(value => supported.has(normalizeLocationValue(value)));
  }
  // Keep the field just edited as the explicit source; release redundant selections.
  for (const other of locationKeys) {
    if (other === key || next[other].length !== 1) continue;
    const implied = getLinkedInstitutionFilters(institutions, { ...next, [other]: [] })[other];
    if (implied.disabled && normalizeLocationValue(implied.values[0]) === normalizeLocationValue(next[other][0])) {
      next[other] = [];
    }
  }
  return next;
}
