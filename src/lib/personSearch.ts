type PersonSearchFields = {
  firstName?: string | null;
  lastName?: string | null;
  nif?: string | null;
  ninu?: string | null;
};

type ContractSearchFields = PersonSearchFields & {
  position?: string | null;
  assignment?: string | null;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesFields(values: Array<string | null | undefined>, query: string): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const queryDigits = query.replace(/\D/g, "");
  const isIdentifierQuery = queryDigits.length > 0 && !normalizedQuery.replace(/\d/g, "").trim();
  if (isIdentifierQuery) {
    return values.some((value) => (value ?? "").replace(/\D/g, "").includes(queryDigits));
  }

  const searchableText = normalizeText(values.filter(Boolean).join(" "));
  return normalizedQuery.split(/\s+/).every((token) => searchableText.includes(token));
}

export function matchesPersonSearch(person: PersonSearchFields, query: string): boolean {
  return matchesFields(
    [person.firstName, person.lastName, person.nif, person.ninu],
    query
  );
}

export function matchesContractSearch(contract: ContractSearchFields, query: string): boolean {
  return matchesFields(
    [
      contract.firstName,
      contract.lastName,
      contract.nif,
      contract.ninu,
      contract.position,
      contract.assignment
    ],
    query
  );
}
