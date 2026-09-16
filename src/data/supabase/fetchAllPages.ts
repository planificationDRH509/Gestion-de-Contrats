export type PageResult<T> = {
  items: T[];
  total: number | null;
};

/**
 * Collects every server page before client-side filtering is applied.
 *
 * Supabase/PostgREST limits the number of rows returned by one request, even
 * when no explicit range is specified. Advancing by the number of rows that
 * was actually returned also supports projects configured with a lower cap.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  requestedPageSize = 1_000
): Promise<T[]> {
  const items: T[] = [];

  while (true) {
    const page = await fetchPage(items.length, items.length + requestedPageSize - 1);
    items.push(...page.items);

    if (page.items.length === 0) {
      if (page.total !== null && items.length < page.total) {
        throw new Error("Téléchargement incomplet : actualisez les données avant de continuer.");
      }
      break;
    }
    if (page.total !== null && items.length >= page.total) break;
    if (page.total === null && page.items.length < requestedPageSize) break;
  }

  return items;
}
