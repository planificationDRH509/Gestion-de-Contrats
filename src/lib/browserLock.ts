const queues = new Map<string, Promise<unknown>>();

/** One replay per origin, including independent tabs/windows. */
export async function withBrowserLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request(`contribution:${name}`, action);
  }
  const next = (queues.get(name) ?? Promise.resolve()).catch(() => undefined).then(action);
  queues.set(name, next);
  void next.finally(() => { if (queues.get(name) === next) queues.delete(name); }).catch(() => undefined);
  return next;
}
