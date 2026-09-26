import { get, update } from 'idb-keyval';
import type { AuthUser } from '../auth/auth';
import type { Contract } from '../../data/types';
import { getSupabaseClient } from '../../data/supabase/supabaseClient';
import type { Json } from '../../data/supabase/database.types';

export type Attachment = {
  id: string; name: string; kind: 'file' | 'link' | 'path';
  location?: string | null; size?: number | null; createdAt: string;
};
export type AttachmentDraft = Pick<Attachment, 'id' | 'name' | 'kind' | 'location'> & { content?: string };
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const remoteAttachments = (import.meta.env.VITE_DATA_PROVIDER ?? 'local') === 'supabase';

export function validDocumentLink(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname; }
  catch { return false; }
}
export function validateAttachment(draft: AttachmentDraft) {
  if (!draft.name.trim() || draft.name.trim().length > 255) throw new Error('Nom requis (255 caractères maximum).');
  if (draft.kind === 'file') {
    if (!draft.content || draft.content.length > Math.ceil(MAX_ATTACHMENT_SIZE / 3) * 4) throw new Error('Fichier vide ou trop volumineux (10 Mo maximum).');
  } else {
    if (!draft.location?.trim() || draft.location.trim().length > 4096) throw new Error('Lien ou chemin requis (4 096 caractères maximum).');
    if (draft.kind === 'link' && !validDocumentLink(draft.location.trim())) throw new Error('Saisissez un lien HTTP ou HTTPS valide.');
  }
}
export function readAttachmentFile(file: File): Promise<string> {
  if (!file.size || file.size > MAX_ATTACHMENT_SIZE) return Promise.reject(new Error('Fichier vide ou trop volumineux (10 Mo maximum).'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

type StoredAttachment = Attachment & { content?: string };
export async function manageAttachments(user: AuthUser, contract: Contract, action: 'list' | 'add' | 'delete' | 'get', document: Partial<AttachmentDraft> = {}): Promise<Attachment[] | {name: string; content: string}> {
  if (['add', 'delete'].includes(action) && user.role === 'reader') throw new Error('Modification non autorisée.');
  if (action === 'add') validateAttachment(document as AttachmentDraft);
  if (remoteAttachments) {
    if (!navigator.onLine) throw new Error('Connectez-vous pour accéder aux pièces jointes.');
    if (!user.taskSessionToken) throw new Error('Reconnectez-vous pour accéder aux pièces jointes.');
    const {data, error} = await getSupabaseClient().rpc('manage_person_attachments', {
      p_session_token: user.taskSessionToken, p_contract_id: contract.id, p_action: action, p_document: document as Json
    });
    if (error) throw new Error(error.message);
    return data as unknown as Attachment[] | {name: string; content: string};
  }
  const key = `person-attachments:${contract.workspaceId}:${contract.applicantId || contract.nif || contract.id}`;
  if (action === 'add' || action === 'delete') {
    await update<StoredAttachment[]>(key, (items = []) => {
      if (action === 'delete') return items.filter(item => item.id !== document.id);
      if (items.some(item => item.id === document.id)) return items;
      const draft = document as AttachmentDraft;
      return [{...draft, name: draft.name.trim(), location: draft.location?.trim(), createdAt: new Date().toISOString(), size: draft.content ? atob(draft.content).length : null}, ...items];
    });
  }
  const items = await get<StoredAttachment[]>(key) ?? [];
  if (action === 'get') {
    const item = items.find(item => item.id === document.id);
    if (!item?.content) throw new Error('Fichier introuvable.');
    return {name: item.name, content: item.content};
  }
  return items.map(({content: _content, ...item}) => item);
}

export function downloadAttachment(name: string, content: string) {
  const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
