import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./fetchAllPages";

describe("fetchAllPages", () => {
  it("loads rows beyond the first server response", async () => {
    const rows = Array.from({ length: 1_205 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      items: rows.slice(from, Math.min(to + 1, from + 500)),
      total: rows.length
    }));

    await expect(fetchAllPages(fetchPage)).resolves.toEqual(rows);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 500, 1_499);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 1_000, 1_999);
  });

  it("stops on a short final page when the server omits the total", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      items: rows.slice(from, to + 1),
      total: null
    }));

    await expect(fetchAllPages(fetchPage, 10)).resolves.toEqual(rows);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
