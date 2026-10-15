import { localEditWins } from "../latestEdit";
export class OfflineConflict extends Error {
  constructor(public fields: string[], public remote: Record<string, unknown>, message?: string) {
    super(message ?? `Conflit sur ${fields.join(", ")} : choisissez les valeurs à conserver.`);
  }
}

/** Preserve remote-only fields and resolve divergent edits by their original clock. */
export function mergeOfflinePatch<T extends object>(
  local: Partial<T>, base: T | undefined, remote: T, fields: readonly (keyof T)[], modifiedAt?: string
): Partial<T> {
  const changes: Partial<T> = {};
  if (modifiedAt && !localEditWins(modifiedAt, remote)) return {};
  for (const field of fields) {
    if (local[field] === undefined) continue;
    const before = base?.[field] ?? null, next = local[field] ?? null, current = remote[field] ?? null;
    if (base && JSON.stringify(next) === JSON.stringify(before)) continue;
    if (JSON.stringify(next) === JSON.stringify(current)) continue;
    // Legacy callers without an edit clock retain the explicit conflict path.
    if (!modifiedAt && (!base || JSON.stringify(current) !== JSON.stringify(before))) {
      throw new OfflineConflict([String(field)], remote as Record<string, unknown>);
    }
    changes[field] = local[field];
  }

  return changes;
}

export const contractEditFields = ["status", "position", "assignment", "salaryNumber",
  "durationMonths", "dossierId", "applicantId", "nif", "commentaire", "createdAt", "annee_fiscale"] as const;
export const dossierEditFields = ["name", "status", "isEphemeral", "priority", "contractTargetCount",
  "comment", "deadlineDate", "focalPoint", "roadmapSheetNumber", "defaultDurationMonths"] as const;
