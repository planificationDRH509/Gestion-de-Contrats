import { afterEach, expect, it, vi } from "vitest";
import { networkFetch } from "./networkFetch";
import { isOfflineFailure } from "../data/local/offlineStore";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("bounds an unreachable request and classifies the timeout as a network failure", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })));
  const result = networkFetch("https://example.invalid").catch(error => error);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(isOfflineFailure(await result)).toBe(true);
});
it("does not disguise a programming TypeError as loss of connectivity", () => {
  expect(isOfflineFailure(new TypeError("Cannot read properties of undefined"))).toBe(false);
  expect(isOfflineFailure(new TypeError("Failed to fetch"))).toBe(true);
});

it.each([408, 429, 500, 503, 504])("preserves temporary HTTP %s failures through the Supabase fetch wrapper", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status })));
  const error = await networkFetch("https://example.invalid").catch(error => error);
  expect(isOfflineFailure({ message: String(error) })).toBe(true);
});
it("leaves validation and permission responses available to the caller", async () => {
  const response = new Response("Invalid data", { status: 400 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(await networkFetch("https://example.invalid")).toBe(response);
});
