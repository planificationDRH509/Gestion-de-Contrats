/** A Wi-Fi connection without Internet must not leave saves waiting indefinitely. */
export async function networkFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const outer = init.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(outer?.reason);
  if (outer?.aborted) abort(); else outer?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !outer?.aborted) throw new TypeError("Network request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abort);
  }
}
