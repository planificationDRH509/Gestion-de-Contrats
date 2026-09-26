import { useState } from 'react';
import { useAuth } from '../auth/auth';
import { useSalaryGrid } from './salaryGridApi';
import { normalizeTitle, SalaryGridEntry } from './salaryGrid';
import './salaryGrid.css';

export function SalaryGridPage() {
  const { can } = useAuth();
  const { entries, isLoading, error, save, saving, refetch } = useSalaryGrid();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<SalaryGridEntry | null>(null);
  const [amounts, setAmounts] = useState('');
  const [failure, setFailure] = useState('');
  const categories = [...new Set(entries.map(e => e.category))].sort((a,b) => a.localeCompare(b,'fr'));
  const rows = entries.filter(e => (!category || e.category === category) && normalizeTitle([e.masculine,e.feminine,...e.aliases].join(' ')).includes(normalizeTitle(search)))
    .sort((a,b) => a.category.localeCompare(b.category,'fr') || a.masculine.localeCompare(b.masculine,'fr'));
  function edit(entry: SalaryGridEntry) { setEditing({...entry}); setAmounts(entry.salaries.join('; ')); setFailure(''); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    try {
      const previous = entries.find(entry => entry.id === editing.id);
      const aliases = [...new Set([...editing.aliases, ...(previous && (previous.masculine !== editing.masculine || previous.feminine !== editing.feminine) ? [previous.masculine, previous.feminine] : [])])].filter(Boolean);
      await save({...editing, aliases, salaries: amounts.split(';').map(v => Number(v.trim().replace(/\s/g,'').replace(',','.')))});
      setEditing(null);
    } catch (e) { setFailure(e instanceof Error ? e.message : (e as {message?:string}).message ?? 'Enregistrement impossible.'); }
  }
  return <section className="salary-grid-page">
    <div className="salary-grid-heading"><h1>Grille Salariale</h1>{can('settings.manage') && <button className="btn btn-primary" onClick={() => edit({id:crypto.randomUUID(), masculine:'',feminine:'',category:'Personnel administratif',salaries:[],aliases:[],effectiveDate:new Date().toISOString().slice(0,10),source:'',sourceRows:[],notes:'',active:true,version:0})}>Ajouter un titre</button>}</div>
    <div className="salary-grid-toolbar">
      <input className="input" aria-label="Rechercher un titre" placeholder="Rechercher un titre" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="input" aria-label="Type de personnel" value={category} onChange={e => setCategory(e.target.value)}><option value="">Tous les types</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
      <span>{rows.length} {rows.length === 1 ? "titre" : "titres"}</span>
    </div>
    {isLoading && <p role="status">Chargement…</p>}
    {error && <div role="alert">Grille indisponible. <button className="btn" onClick={() => void refetch()}>Réessayer</button></div>}
    <div className="salary-grid-table"><table><thead><tr><th>Titre masculin</th><th>Titre féminin</th><th>Type de personnel</th><th>Salaires (HTG)</th><th>Date d’effet</th><th>Statut</th>{can('settings.manage') && <th aria-label="Actions" />}</tr></thead><tbody>
      {rows.map(entry => <tr key={entry.id} className={entry.active ? '' : 'salary-grid-inactive'}><td>{entry.masculine}</td><td>{entry.feminine}</td><td>{entry.category}</td><td className="salary-grid-money">{entry.salaries.map(s => s.toLocaleString('fr-HT')).join(' / ')}</td><td>{entry.effectiveDate ? entry.effectiveDate.split('-').reverse().join('/') : '—'}</td><td>{entry.active ? 'Actif' : 'À valider / inactif'}</td>{can('settings.manage') && <td><button className="btn" aria-label={`Modifier ${entry.masculine}`} onClick={() => edit(entry)}>Modifier</button></td>}</tr>)}
      {!isLoading && !rows.length && <tr><td colSpan={7}>Aucun titre</td></tr>}
    </tbody></table></div>
    {editing && <div className="salary-grid-overlay"><form className="salary-grid-editor" role="dialog" aria-modal="true" aria-labelledby="salary-grid-edit-title" onSubmit={submit} onKeyDown={event => { if(event.key==='Escape' && !saving) setEditing(null); }}>
      <h2 id="salary-grid-edit-title">{editing.version ? 'Modifier le titre' : 'Ajouter un titre'}</h2>
      <label>Titre masculin<input autoFocus required className="input" value={editing.masculine} onChange={e => setEditing({...editing,masculine:e.target.value})} /></label>
      <label>Titre féminin<input required className="input" value={editing.feminine} onChange={e => setEditing({...editing,feminine:e.target.value})} /></label>
      <label>Type de personnel<input required className="input" list="salary-categories" value={editing.category} onChange={e => setEditing({...editing,category:e.target.value})} /></label>
      <datalist id="salary-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
      <label>Salaires autorisés (HTG)<input required className="input" placeholder="37200; 41700" value={amounts} onChange={e => setAmounts(e.target.value)} /></label>
      <label>Date d’effet<input className="input" type="date" required={editing.active} value={editing.effectiveDate ?? ''} onChange={e => setEditing({...editing,effectiveDate:e.target.value || null})} /></label>
      <label>Autres écritures<textarea className="input" value={editing.aliases.join('\n')} onChange={e => setEditing({...editing,aliases:e.target.value.split('\n')})} /></label>
      <label>Source<input className="input" value={editing.source} onChange={e => setEditing({...editing,source:e.target.value})} /></label>
      <label>Observations<textarea className="input" value={editing.notes} onChange={e => setEditing({...editing,notes:e.target.value})} /></label>
      <label className="salary-grid-active"><input type="checkbox" checked={editing.active} onChange={e => setEditing({...editing,active:e.target.checked})} />Actif</label>
      {failure && <p role="alert" className="form-error">{failure}</p>}
      <div className="salary-grid-actions"><button type="button" className="btn" disabled={saving} onClick={() => setEditing(null)}>Annuler</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </form></div>}
  </section>;
}
