const suggestionCollator = new Intl.Collator("fr", {
  sensitivity: "base",
  numeric: true
});

function normalizeSuggestionSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function filterAndSortSuggestions<T extends { label: string }>(
  items: readonly T[],
  query: string,
  getSearchValues: (item: T) => Array<string | null | undefined>
) {
  const tokens = normalizeSuggestionSearch(query).split(/\s+/).filter(Boolean);

  return items
    .filter((item) => {
      if (tokens.length === 0) return true;

      const searchableText = normalizeSuggestionSearch(
        getSearchValues(item).filter(Boolean).join(" ")
      );
      return tokens.every((token) => searchableText.includes(token));
    })
    .slice()
    .sort((left, right) =>
      suggestionCollator.compare(left.label.trim(), right.label.trim())
    );
}
