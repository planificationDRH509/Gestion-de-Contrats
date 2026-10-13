import { selectDb } from './localDb';

export type ReferenceScope = 'addresses' | 'positions' | 'institutions' | 'salary' | 'prepositions' | 'ministers';
export type ReferenceEntry = Record<string, unknown>;
export type ReferencePatch = { id: string; before: ReferenceEntry | null; after: ReferenceEntry | null };
export type ReferenceChange = {
  scope: ReferenceScope;
  patches: ReferencePatch[];
  input?: ReferenceEntry;
  learn?: boolean;
};

export function referenceWorkspace() {
  try { return JSON.parse(localStorage.getItem('contribution_auth') ?? 'null')?.workspaceId ?? ''; }
  catch { return ''; }
}

export function pendingReferences(scope: ReferenceScope, workspaceId = referenceWorkspace()) {
  return selectDb(db => db.outbox.filter(item => !item.syncedAt && item.type === 'reference.change' &&
    item.payload.scope === scope && (['salary', 'prepositions', 'ministers'].includes(scope) || item.workspaceId === workspaceId)));
}

/** Project durable edits over the last server snapshot, including after a reload. */
export function overlayReferences<T>(scope: ReferenceScope, entries: T[], workspaceId?: string): T[] {
  const key = (entry: T) => String((entry as ReferenceEntry).id ?? (entry as ReferenceEntry).family);
  const result = new Map(entries.map(entry => [key(entry), entry]));
  for (const item of pendingReferences(scope, workspaceId)) {
    for (const patch of (item.payload as unknown as ReferenceChange).patches) {
      if (patch.after) result.set(patch.id, patch.after as T);
      else result.delete(patch.id);
    }
  }
  return [...result.values()];
}

export function overlayMinisterSelection(current: string) {
  for (const item of pendingReferences('ministers')) {
    const input = (item.payload as unknown as ReferenceChange).input;
    if (input?.action === 'select') current = String(input.ministerId);
  }
  return current;
}

export function projectInstitutionAssignment<T extends { workspaceId: string; assignment: string }>(contract: T): T {
  let assignment = contract.assignment;
  for (const item of pendingReferences('institutions', contract.workspaceId)) {
    for (const patch of (item.payload as unknown as ReferenceChange).patches) {
      if (patch.before && patch.after && assignment === patch.before.label) assignment = String(patch.after.label);
    }
  }
  return assignment === contract.assignment ? contract : { ...contract, assignment };
}
