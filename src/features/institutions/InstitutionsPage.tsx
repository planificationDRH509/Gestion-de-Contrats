import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/auth';
import type { InstitutionSuggestion } from '../../data/local/suggestionsDb';
import { useInstitutionCatalogue } from './institutionsApi';
import { DEPARTMENTS, INSTITUTION_TYPES, institutionType, normalizeInstitution } from './institutions';
import './institutions.css';
import { INSTITUTION_PREPOSITION_FAMILIES, type InstitutionPrepositionRule } from './institutionPrepositions';
import { useInstitutionPrepositions } from './institutionPrepositionsApi';

export function InstitutionsPage() {
  const {can} = useAuth();
  const {entries,save,saving,isLoading,error,refetch} = useInstitutionCatalogue();
  const prepositions = useInstitutionPrepositions();
  const [prepositionDraft,setPrepositionDraft] = useState<InstitutionPrepositionRule[] | null>(null);
  const [search,setSearch] = useState('');
  const [department,setDepartment] = useState('');
  const [commune,setCommune] = useState('');
  const [type,setType] = useState('');
  const [editing,setEditing] = useState<InstitutionSuggestion | null>(null);
  const [failure,setFailure] = useState('');
  const editor = useRef<HTMLFormElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const canEdit = can('settings.manage');
  const matchesDepartment = (e: InstitutionSuggestion) => !department || normalizeInstitution(e.department ?? '') === normalizeInstitution(department);
  const communes = [...new Set(entries.filter(matchesDepartment).map(e => e.commune).filter((c):c is string => Boolean(c)))].sort((a,b) => a.localeCompare(b,'fr'));
  const rows = entries.filter(e => matchesDepartment(e) && (!commune || e.commune === commune) && (!type || (type === 'unknown' ? !institutionType(e) : institutionType(e) === type)) &&
    normalizeInstitution([e.label,e.department,e.commune,institutionType(e)].join(' ')).includes(normalizeInstitution(search)))
    .sort((a,b) => a.label.localeCompare(b.label,'fr',{sensitivity:'base'}));
  function edit(entry: InstitutionSuggestion) {
    previousFocus.current = document.activeElement as HTMLElement;
    setFailure('');
    setEditing({...entry,institutionType:institutionType(entry),version:entry.version ?? 1});
  }
  useEffect(() => {
    if (!editing && !prepositionDraft) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; previousFocus.current?.focus(); };
  }, [Boolean(editing || prepositionDraft)]);
  async function savePrepositions(event: React.FormEvent) {
    event.preventDefault();
    if (!prepositionDraft || prepositions.saving) return;
    setFailure('');
    const changes = prepositionDraft.filter(rule => rule.prefix.trim() !== prepositions.rules.find(r => r.family === rule.family)?.prefix);
    try { if (changes.length) await prepositions.save(changes); setPrepositionDraft(null); }
    catch(e) { setFailure(e instanceof Error ? e.message : (e as {message?:string}).message ?? 'Enregistrement impossible.'); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    setFailure('');
    try { await save(editing); setEditing(null); }
    catch(e) { setFailure(e instanceof Error ? e.message : (e as {message?:string}).message ?? 'Enregistrement impossible.'); }
  }
  return <section className="institutions-page">
    <div className="institutions-heading"><h1>Institutions</h1>{canEdit && <div className="institutions-actions">
      <button className="btn" disabled={prepositions.isFetching || Boolean(prepositions.error)} onClick={() => {previousFocus.current=document.activeElement as HTMLElement;setFailure('');setPrepositionDraft(prepositions.rules.map(rule => ({...rule})));}}>Prépositions</button>
      <button className="btn btn-primary" onClick={() => edit({id:crypto.randomUUID(),label:'',department:null,commune:null,institutionType:null,source:null,addressKeywords:[],order:entries.length,version:0})}>Ajouter une institution</button>
    </div>}</div>
    <div className="institutions-toolbar">
      <input className="input" aria-label="Rechercher une institution" placeholder="Rechercher une institution" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="input" aria-label="Département" value={department} onChange={e => {setDepartment(e.target.value);setCommune('');}}><option value="">Tous les départements</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select>
      <select className="input" aria-label="Commune" value={commune} onChange={e => setCommune(e.target.value)}><option value="">Toutes les communes</option>{communes.map(c => <option key={c}>{c}</option>)}</select>
      <select className="input" aria-label="Type d’institution" value={type} onChange={e => setType(e.target.value)}><option value="">Tous les types</option>{INSTITUTION_TYPES.map(t => <option key={t}>{t}</option>)}<option value="unknown">Non renseigné</option></select>
      <span className="institutions-count">{rows.length} {rows.length === 1 ? 'institution' : 'institutions'}</span>
    </div>
    {isLoading && <p role="status">Chargement…</p>}
    {error && <div role="alert">Institutions indisponibles. <button className="btn" onClick={() => void refetch()}>Réessayer</button></div>}
    {canEdit && prepositions.error && <div role="alert">Prépositions indisponibles. <button className="btn" onClick={() => void prepositions.refetch()}>Réessayer</button></div>}
    <div className="institutions-table"><table><thead><tr><th>Institution</th><th>Département</th><th>Commune</th><th>Type</th>{canEdit && <th aria-label="Actions" />}</tr></thead><tbody>
      {rows.map(entry => <tr key={entry.id}><td>{entry.label}</td><td>{entry.department || '—'}</td><td>{entry.commune || '—'}</td><td>{institutionType(entry) || '—'}</td>{canEdit && <td><button className="btn" aria-label={`Modifier ${entry.label}`} onClick={() => edit(entry)}>Modifier</button></td>}</tr>)}
      {!isLoading && !rows.length && <tr><td colSpan={canEdit ? 5 : 4}>Aucune institution</td></tr>}
    </tbody></table></div>
    {editing && <div className="institutions-overlay"><form ref={editor} className="institutions-editor" role="dialog" aria-modal="true" aria-labelledby="institution-edit-title" onSubmit={submit} onKeyDown={event => {
      if(event.key === 'Escape' && !saving) setEditing(null);
      if(event.key === 'Tab') {
        const items = editor.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)');
        const first=items?.[0],last=items?.[items.length-1];
        if(event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
      }
    }}>
      <h2 id="institution-edit-title">{editing.version ? 'Modifier l’institution' : 'Ajouter une institution'}</h2>
      <label>Nom<input autoFocus required maxLength={250} className="input" value={editing.label} onChange={e => setEditing({...editing,label:e.target.value})} /></label>
      <label>Département<select aria-label="Département" className="input" value={editing.department ? DEPARTMENTS.find(d => normalizeInstitution(d) === normalizeInstitution(editing.department!)) ?? '' : ''} onChange={e => setEditing({...editing,department:e.target.value || null,commune:null})}><option value="">Non renseigné</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></label>
      <label>Commune<input className="input" maxLength={150} list="institution-communes" disabled={!editing.department} value={editing.commune ?? ''} onChange={e => setEditing({...editing,commune:e.target.value || null})} /></label>
      <datalist id="institution-communes">{[...new Set(entries.filter(e => normalizeInstitution(e.department ?? '') === normalizeInstitution(editing.department ?? '')).map(e => e.commune).filter(Boolean))].map(c => <option key={c} value={c!} />)}</datalist>
      <label>Type<select aria-label="Type" required className="input" value={editing.institutionType ?? ''} onChange={e => setEditing({...editing,institutionType:e.target.value || null})}><option value="">Choisir</option>{INSTITUTION_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      {failure && <p role="alert" className="form-error">{failure}</p>}
      <div className="institutions-actions"><button type="button" className="btn" disabled={saving} onClick={() => setEditing(null)}>Annuler</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </form></div>}
    {prepositionDraft && <div className="institutions-overlay"><form ref={editor} className="institutions-editor" role="dialog" aria-modal="true" aria-labelledby="institution-prepositions-title" onSubmit={savePrepositions} onKeyDown={event => {
      if(event.key === 'Escape' && !prepositions.saving) setPrepositionDraft(null);
      if(event.key === 'Tab') {
        const items=editor.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)');
        const first=items?.[0],last=items?.[items.length-1];
        if(event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
      }
    }}>
      <h2 id="institution-prepositions-title">Prépositions</h2>
      {INSTITUTION_PREPOSITION_FAMILIES.map((family,index) => <label key={family.id} className="institution-preposition-row">{family.label}<input autoFocus={index===0} className="input" required maxLength={50} disabled={prepositions.saving} value={prepositionDraft.find(rule => rule.family===family.id)?.prefix ?? family.prefix} onChange={event => setPrepositionDraft(prepositionDraft.map(rule => rule.family===family.id ? {...rule,prefix:event.target.value} : rule))} /></label>)}
      {failure && <p role="alert" className="form-error">{failure}</p>}
      <div className="institutions-actions"><button type="button" className="btn" disabled={prepositions.saving} onClick={() => setPrepositionDraft(null)}>Annuler</button><button className="btn btn-primary" disabled={prepositions.saving}>{prepositions.saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </form></div>}
  </section>;
}
