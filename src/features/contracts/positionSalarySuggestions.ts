import type { AutocompleteItem } from "../../app/ui/AutocompleteField";
import type { PositionSuggestion } from "../../data/local/suggestionsDb";

export type PositionSalaryAutocompleteItem = AutocompleteItem & {
  positionId: string;
  salaryNumber?: number;
};

function validUniqueSalaries(salaries: number[] | undefined): number[] {
  return Array.from(
    new Set((salaries ?? []).filter((salary) => Number.isFinite(salary) && salary > 0))
  );
}

/**
 * Build one selectable autocomplete entry for every salary attached to a post.
 * The visible label remains the post name while the salary distinguishes each
 * choice and is applied by the form after selection.
 */
export function buildPositionSalaryItems(
  positions: PositionSuggestion[]
): PositionSalaryAutocompleteItem[] {
  return positions.flatMap((position) => {
    const salaries = validUniqueSalaries(position.salaries);

    if (salaries.length === 0) {
      return [{
        id: position.id,
        label: position.label,
        positionId: position.id,
      }];
    }

    return salaries.map((salary) => ({
      id: `${position.id}::salary:${salary}`,
      label: position.label,
      sublabel: `${salary.toLocaleString("fr-HT")} HTG`,
      positionId: position.id,
      salaryNumber: salary,
    }));
  });
}

export function findFeaturedPositionSalaryItem(
  items: PositionSalaryAutocompleteItem[],
  positionLabel: string | null,
  salaryValue: string | null
): PositionSalaryAutocompleteItem | undefined {
  if (!positionLabel) return undefined;

  const salaryNumber = salaryValue ? Number(salaryValue) : Number.NaN;
  return items.find(
    (item) => item.label === positionLabel && item.salaryNumber === salaryNumber
  ) ?? items.find((item) => item.label === positionLabel);
}
