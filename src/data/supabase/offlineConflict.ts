export class OfflineConflict extends Error {
  constructor(public fields: string[], public remote: Record<string, unknown>) {
    super(`Conflit sur ${fields.join(", ")} : choisissez les valeurs à conserver.`);
  }
}

/** Preserve remote-only edits and stop only when both sides changed the same field. */
export function mergeOfflinePatch<T extends object>(
  local: Partial<T>, base: T | undefined, remote: T, fields: readonly (keyof T)[]
): Partial<T> {
  const changes: Partial<T> = {};
  const conflicts: string[] = [];
  for (const field of fields) {
    if (local[field] === undefined) continue;
    const before = base?.[field] ?? null, next = local[field] ?? null, current = remote[field] ?? null;
    if (base && JSON.stringify(next) === JSON.stringify(before)) continue;
    if (JSON.stringify(next) === JSON.stringify(current)) continue;
    if (!base || JSON.stringify(current) !== JSON.stringify(before)) conflicts.push(String(field));
    changes[field] = local[field];
  }
  if (conflicts.length) throw new OfflineConflict(conflicts, remote as Record<string, unknown>);
  return changes;
}

export const contractEditFields = ["status", "position", "assignment", "salaryNumber",
  "durationMonths", "dossierId", "applicantId", "nif", "commentaire"] as const;
export const dossierEditFields = ["name", "status", "isEphemeral", "priority", "contractTargetCount",
  "comment", "deadlineDate", "focalPoint", "roadmapSheetNumber", "defaultDurationMonths"] as const;
