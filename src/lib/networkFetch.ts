/** A Wi-Fi connection without Internet must not leave saves waiting indefinitely. */
export async function networkFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const outer = init.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(outer?.reason);
  if (outer?.aborted) abort(); else outer?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // Supabase converts fetch errors into plain objects and drops HTTP status.
    // Keep temporary HTTP failures recognizable through that conversion.
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new TypeError(`Network request temporarily unavailable (HTTP ${response.status}).`);
    }
    return response;
  } catch (error) {
    if (controller.signal.aborted && !outer?.aborted) throw new TypeError("Network request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abort);
  }
}
