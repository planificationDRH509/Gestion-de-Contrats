import { flushLocalDbWrites, loadDb } from './localDb';
import { queueOutbox } from './localOutbox';
import type { ReferenceChange } from './referenceOverlay';

export async function queueReferenceChange(workspaceId: string, change: ReferenceChange) {
  const actor = JSON.parse(localStorage.getItem('contribution_auth') ?? 'null');
  if (!actor?.id || !actor.taskSessionToken || actor.workspaceId !== workspaceId) throw new Error('Session utilisateur indisponible.');
  if (actor.role !== 'admin' && !(change.learn && actor.role === 'agent')) throw new Error('Modification non autorisée.');
  if (change.scope === 'institutions') {
    const db = loadDb();
    const renamed = new Set(change.patches.filter(p => p.before && p.after && p.before.label !== p.after.label).map(p => p.before!.label));
    const affected = new Set(db.contracts.filter(c => c.workspaceId === workspaceId && renamed.has(c.assignment)).map(c => c.id));
    if (db.contractLists.some(list => list.workspaceId === workspaceId && list.sealedAt && list.members.some(member => affected.has(member.id)))) {
      throw new Error('Cette institution est utilisée dans une liste scellée. Faites rouvrir la liste avant de la renommer.');
    }
  }
  queueOutbox(workspaceId, 'reference.change', change as unknown as Record<string, unknown>);
  await flushLocalDbWrites();
}
