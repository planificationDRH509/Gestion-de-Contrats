/** The edit clock is independent of upload time and queue ordering. */
export function editTime(value: unknown): number {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function latestEditAt(record: { modifiedAt?: string | null; updatedAt?: string | null; createdAt?: string | null; deletedAt?: string | null }): string | undefined {
  return record.modifiedAt || record.updatedAt || record.deletedAt || record.createdAt || undefined;
}

/** Equal clocks keep the persisted version, so retries cannot oscillate. */
export function localEditWins(localAt: string | undefined, remote: Parameters<typeof latestEditAt>[0]): boolean {
  return editTime(localAt) > editTime(latestEditAt(remote));
}


let lastLocalEdit = 0;
/** Monotonic within this tab, including multiple edits in the same millisecond. */
export function newEditTimestamp(): string {
  lastLocalEdit = Math.max(Date.now(), lastLocalEdit + 1);
  return new Date(lastLocalEdit).toISOString();
}
