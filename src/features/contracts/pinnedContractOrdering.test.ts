import { describe, expect, it } from "vitest";
import type { Contract, ContractListParams, ContractListResult } from "../../data/types";
import { listContractsPinnedFirst } from "./pinnedContractOrdering";

const contracts = Array.from({ length: 40 }, (_, index) => ({
  id: `c${String(index + 1).padStart(2, "0")}`,
  createdBy: index === 29 ? "other" : "me"
} as Contract));

async function list(params: ContractListParams): Promise<ContractListResult> {
  let items = contracts;
  if (params.includeIds) items = items.filter(item => params.includeIds!.includes(item.id));
  if (params.excludeIds) items = items.filter(item => !params.excludeIds!.includes(item.id));
  if (params.onlyMine && params.userId) items = items.filter(item => item.createdBy === params.userId);
  if (params.query) items = items.filter(item => item.id.includes(params.query!));
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  const start = params.offset ?? (page - 1) * pageSize;
  return { items: params.all ? items : items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

describe("pinned contract ordering", () => {
  it("moves pins from later pages to the first page without duplicates or changing the total", async () => {
    const params: ContractListParams = {
      workspaceId: "w", pageSize: 25, pinnedIds: ["c30", "c03", "c25"]
    };
    const first = await listContractsPinnedFirst(list, { ...params, page: 1 });
    const second = await listContractsPinnedFirst(list, { ...params, page: 2 });
    expect(first.items.slice(0, 3).map(item => item.id)).toEqual(["c03", "c25", "c30"]);
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(15);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(40);
    expect(first.total).toBe(40);
    expect(second.total).toBe(40);
  });

  it("only promotes pins that match the active filter", async () => {
    const result = await listContractsPinnedFirst(list, {
      workspaceId: "w", page: 1, pageSize: 25, query: "3", pinnedIds: ["c03", "c25", "c30"]
    });
    expect(result.items[0].id).toBe("c03");
    expect(result.items.map(item => item.id)).not.toContain("c25");
    expect(result.total).toBe(13);
  });

  it("keeps a personally pinned shared contract above the user's own contracts", async () => {
    const result = await listContractsPinnedFirst(list, {
      workspaceId: "w", page: 1, pageSize: 25, onlyMine: true, userId: "me", pinnedIds: ["c30"]
    });
    expect(result.items[0].id).toBe("c30");
    expect(result.total).toBe(40);
  });
});
