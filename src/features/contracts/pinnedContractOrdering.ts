import type { ContractListParams, ContractListResult } from "../../data/types";

/** Keep personal pins ahead of the normal sort without changing page size or filters. */
export async function listContractsPinnedFirst(
  list: (params: ContractListParams) => Promise<ContractListResult>,
  params: ContractListParams
): Promise<ContractListResult> {
  const pinnedIds = [...new Set(params.pinnedIds ?? [])];
  if (pinnedIds.length === 0) return list(params);

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const base = { ...params, pinnedIds: undefined };
  const pinned = await list({
    ...base,
    includeIds: pinnedIds,
    excludeIds: undefined,
    // A user may pin a shared contract while viewing "Tous les contrats".
    onlyMine: false,
    offset: undefined,
    page: 1,
    all: true
  });

  if (params.all) {
    const unpinned = await list({
      ...base, includeIds: undefined, excludeIds: pinnedIds, offset: undefined, page: 1, all: true
    });
    return {
      items: [...pinned.items, ...unpinned.items],
      total: pinned.total + unpinned.total,
      page,
      pageSize
    };
  }

  const start = (page - 1) * pageSize;
  const visiblePinned = pinned.items.slice(start, start + pageSize);
  const remaining = pageSize - visiblePinned.length;
  const unpinned = await list({
    ...base,
    includeIds: undefined,
    excludeIds: pinnedIds,
    offset: Math.max(0, start - pinned.total),
    page: 1,
    pageSize: Math.max(1, remaining),
    all: false
  });
  return {
    items: [...visiblePinned, ...unpinned.items.slice(0, remaining)],
    total: pinned.total + unpinned.total,
    page,
    pageSize
  };
}
