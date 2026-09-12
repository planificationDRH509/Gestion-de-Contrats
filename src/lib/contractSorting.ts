import type { Contract, ContractSort } from "../data/types";

const frenchCollator = new Intl.Collator("fr", {
  sensitivity: "base",
  numeric: true
});

function compareText(left: string | null | undefined, right: string | null | undefined) {
  return frenchCollator.compare(left?.trim() ?? "", right?.trim() ?? "");
}

function compareWithIdTieBreak(
  left: Contract,
  right: Contract,
  primaryComparison: number
) {
  return primaryComparison || left.id.localeCompare(right.id);
}

export function compareContracts(left: Contract, right: Contract, sort: ContractSort) {
  switch (sort) {
    case "createdAt_asc":
      return compareWithIdTieBreak(left, right, left.createdAt.localeCompare(right.createdAt));
    case "name_asc":
      return compareWithIdTieBreak(
        left,
        right,
        compareText(`${left.lastName} ${left.firstName}`, `${right.lastName} ${right.firstName}`)
      );
    case "name_desc":
      return compareWithIdTieBreak(
        left,
        right,
        compareText(`${right.lastName} ${right.firstName}`, `${left.lastName} ${left.firstName}`)
      );
    case "nif_asc":
      return compareWithIdTieBreak(left, right, compareText(left.nif, right.nif));
    case "nif_desc":
      return compareWithIdTieBreak(left, right, compareText(right.nif, left.nif));
    case "createdAt_desc":
    default:
      return compareWithIdTieBreak(left, right, right.createdAt.localeCompare(left.createdAt));
  }
}

export function sortContracts(contracts: Contract[], sort: ContractSort = "createdAt_desc") {
  return [...contracts].sort((left, right) => compareContracts(left, right, sort));
}

export function orderContractsByIds(contracts: Contract[], ids: string[]) {
  const positionById = new Map(ids.map((id, index) => [id, index]));
  return [...contracts].sort(
    (left, right) =>
      (positionById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (positionById.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );
}
