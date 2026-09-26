import { FormEvent, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Contract } from '../../data/types';
import { useAuth } from '../auth/auth';
import { Attachment, AttachmentDraft, downloadAttachment, manageAttachments, readAttachmentFile, validDocumentLink } from './attachmentsRepository';
import './attachments.css';

export function PersonAttachmentsDialog({contract, onClose}: {contract: Contract; onClose: () => void}) {
  const {user, can} = useAuth();
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [kind, setKind] = useState<Attachment['kind']>('file');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Keep the same UUID across retries if an upload response is lost.
  const pendingDraft = useRef<{fingerprint: string; id: string} | null>(null);
  const key = ['person-attachments', user?.id, contract.workspaceId, contract.applicantId || contract.nif || contract.id];
  const query = useQuery({queryKey: key, enabled: !!user, retry: false, networkMode: 'always', queryFn: async () =>
    await manageAttachments(user!, contract, 'list') as Attachment[]});
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Impossible de terminer cette action.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    void run(async () => {
      if (kind === 'file' && !file) throw new Error('Choisissez un fichier.');
      const fingerprint = JSON.stringify([kind,name,location,file?.name,file?.size,file?.lastModified]);
      if (pendingDraft.current?.fingerprint !== fingerprint) pendingDraft.current = {fingerprint,id:crypto.randomUUID()};
      const draft: AttachmentDraft = {id:pendingDraft.current.id,name:name.trim() || file?.name || '',kind};
      if (kind === 'file') draft.content = await readAttachmentFile(file!);
      else draft.location = location.trim();
      const items = await manageAttachments(user, contract, 'add', draft);
      queryClient.setQueryData(key, items);
      pendingDraft.current = null;
      setName(''); setLocation(''); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    });
  }
  return <dialog ref={dialog} className="person-attachments-dialog" aria-labelledby="attachments-title"
    onCancel={event => {event.preventDefault(); if (!busyRef.current) onClose();}}
    onClick={event => {if (event.target === event.currentTarget && !busyRef.current) onClose();}}>
    <div className="attachments-panel">
      <header className="attachments-header">
        <div><h2 id="attachments-title">Pièces jointes</h2><div className="attachments-person">{contract.firstName} {contract.lastName}</div></div>
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose} disabled={busy}><span className="material-symbols-rounded">close</span></button>
      </header>
      <div className="attachments-list" aria-busy={query.isFetching}>
        {query.isPending && <p role="status">Chargement…</p>}
        {query.isError && <div role="alert">{query.error.message} <button className="btn btn-outline" onClick={() => void query.refetch()}>Réessayer</button></div>}
        {query.isSuccess && query.data.length === 0 && <p className="attachments-empty">Aucune pièce jointe</p>}
        {query.data?.map(item => <div className="attachment-row" key={item.id}>
          <span className="material-symbols-rounded attachment-type" aria-hidden="true">{item.kind === 'file' ? 'description' : item.kind === 'link' ? 'link' : 'folder_open'}</span>
          <div className="attachment-details"><strong>{item.name}</strong><span>{item.kind === 'file' ? `${Math.max(1, Math.ceil((item.size ?? 0) / 1024))} Ko` : item.location}</span></div>
          <div className="attachment-actions">
            {item.kind === 'link' && validDocumentLink(item.location ?? '') ? <a className="icon-btn" href={item.location!} target="_blank" rel="noopener noreferrer" title="Ouvrir" aria-label={`Ouvrir ${item.name}`}><span className="material-symbols-rounded">open_in_new</span></a> :
              <button type="button" className="icon-btn" disabled={busy} title={item.kind === 'file' ? 'Télécharger' : 'Copier le chemin'} aria-label={`${item.kind === 'file' ? 'Télécharger' : 'Copier le chemin de'} ${item.name}`} onClick={() => void run(async () => {
                if (item.kind === 'file') {
                  const data = await manageAttachments(user!,contract,'get',{id:item.id}) as {name: string; content: string};
                  downloadAttachment(data.name,data.content);
                } else { await navigator.clipboard.writeText(item.location ?? ''); setCopied(item.id); }
              })}><span className="material-symbols-rounded">{item.kind === 'file' ? 'download' : copied === item.id ? 'check' : 'content_copy'}</span></button>}
            {can('contracts.edit') && <button type="button" className="icon-btn" disabled={busy} aria-label={`Supprimer ${item.name}`} title="Supprimer" onClick={() => setDeleting(item.id)}><span className="material-symbols-rounded">delete</span></button>}
          </div>
          {deleting === item.id && <div className="attachment-delete"><span>Supprimer cette pièce jointe ?</span><button className="btn btn-outline" disabled={busy} onClick={() => setDeleting(null)}>Annuler</button><button className="btn btn-primary" disabled={busy} onClick={() => void run(async () => {queryClient.setQueryData(key,await manageAttachments(user!,contract,'delete',{id:item.id})); setDeleting(null);})}>Supprimer</button></div>}
        </div>)}
      </div>
      {can('contracts.edit') && <form className="attachments-form" onSubmit={submit}>
        <div className="attachments-tabs" role="group" aria-label="Type de pièce jointe">
          {([['file','Fichier','upload_file'],['link','Lien','link'],['path','Chemin externe','folder_open']] as const).map(([value,label,icon]) => <button key={value} type="button" disabled={busy} aria-pressed={kind===value} onClick={() => {setKind(value);setError('');}}><span className="material-symbols-rounded" aria-hidden="true">{icon}</span>{label}</button>)}
        </div>
        <fieldset disabled={busy}>
          {kind === 'file' && <label className="attachment-file-picker">Fichier<input ref={fileInput} type="file" onChange={event => {const selected = event.target.files?.[0] ?? null; setFile(selected);setName(selected?.name ?? '');}} /></label>}
          <label>Nom<input className="input" value={name} maxLength={255} required onChange={event => setName(event.target.value)} /></label>
          {kind !== 'file' && <label>{kind === 'link' ? 'Lien du document' : 'Chemin externe'}<input className="input" type={kind === 'link' ? 'url' : 'text'} value={location} maxLength={4096} required placeholder={kind === 'link' ? 'https://…' : '/dossier/document.pdf'} onChange={event => setLocation(event.target.value)} /></label>}
        </fieldset>
        <button className="btn btn-primary attachment-submit" type="submit" disabled={busy || query.isPending || query.isError}>{busy ? 'En cours…' : 'Ajouter'}</button>
      </form>}
      {error && <div className="attachments-error" role="alert">{error}</div>}
    </div>
  </dialog>;
}
