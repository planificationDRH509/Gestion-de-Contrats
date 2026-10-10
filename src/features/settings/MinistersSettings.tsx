import { useState, type FormEvent } from "react";
import { createId } from "../../lib/uuid";
import type { Minister } from "../../lib/ministers";
import { formatNifInput } from "../../lib/nifInput";
import { useMinisters } from "./ministersApi";

const emptyMinister = (): Minister => ({ id: createId(), fullName: "", gender: "Homme", nif: "", ninu: "", mandateStartDate: "", mandateEndDate: null });
const displayDate = (date?: string | null) => date ? date.split("-").reverse().join("/") : "—";

export function MinistersSettings() {
  const { registry, error, save, saving, isLoading } = useMinisters();
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Minister>(emptyMinister);
  const [mandate, setMandate] = useState<{ minister: Minister; start: string; end: string } | null>(null);
  const currentId = selectedId ?? registry?.currentMinisterId ?? "";
  async function select() {
    setMessage("");
    try { await save({ action: "select", ministerId: currentId }); setSelectedId(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Enregistrement impossible."); }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await save({ action: "add", minister: draft });
      setAdding(false);
      setDraft(emptyMinister());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Enregistrement impossible."); }
  }
  async function updateMandate(event: FormEvent) {
    event.preventDefault();
    if (!mandate) return;
    setMessage("");
    try {
      await save({ action: "mandate", ministerId: mandate.minister.id,
        mandateStartDate: mandate.start, mandateEndDate: mandate.end || null,
        expectedStartDate: mandate.minister.mandateStartDate ?? null,
        expectedEndDate: mandate.minister.mandateEndDate ?? null });
      setMandate(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Enregistrement impossible."); }
  }
  return <section className="card settings-form-card ministers-settings">
    <div className="card-heading">
      <div className="card-heading-icon"><span className="material-symbols-rounded">account_balance</span></div>
      <h2>Ministres</h2>
    </div>
    {isLoading && <p role="status">Chargement…</p>}
    {(message || error) && <p className="form-error" role="alert">{message || (error instanceof Error ? error.message : "Chargement impossible.")}</p>}
    {registry && <>
      <div className="form-group">
        <label className="label" htmlFor="current-minister">Ministre actuel</label>
        <select id="current-minister" className="select" value={currentId} disabled={saving} onChange={event => setSelectedId(event.target.value)}>
          {registry.ministers.map(minister => <option key={minister.id} value={minister.id}>{minister.fullName}</option>)}
        </select>
      </div>
      <div className="form-actions settings-form-actions">
        <button className="button button-primary" disabled={saving || currentId === registry.currentMinisterId} onClick={() => void select()}>Définir comme ministre actuel</button>
        <button className="button button-secondary" disabled={saving} onClick={() => { setAdding(value => !value); setMandate(null); setMessage(""); }}>{adding ? "Annuler" : "Ajouter un ministre"}</button>
      </div>
      {adding && <form className="minister-form" onSubmit={add}>
        <div className="form-group"><label className="label" htmlFor="minister-name">Nom complet</label><input id="minister-name" className="input" required maxLength={200} value={draft.fullName} onChange={event => setDraft({ ...draft, fullName: event.target.value })} /></div>
        <div className="form-group"><label className="label" htmlFor="minister-gender">Sexe</label><select id="minister-gender" className="select" value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value as Minister["gender"] })}><option>Homme</option><option>Femme</option></select></div>
        <div className="form-group"><label className="label" htmlFor="minister-nif">NIF</label><input id="minister-nif" className="input" required inputMode="numeric" maxLength={13} value={draft.nif} onChange={event => setDraft({ ...draft, nif: formatNifInput(event.target.value) })} /></div>
        <div className="form-group"><label className="label" htmlFor="minister-ninu">NINU</label><input id="minister-ninu" className="input" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={draft.ninu} onChange={event => setDraft({ ...draft, ninu: event.target.value.replace(/\D/g, "") })} /></div>
        <div className="form-group"><label className="label" htmlFor="minister-start">Début du mandat</label><input id="minister-start" className="input" type="date" required max="9999-12-31" value={draft.mandateStartDate ?? ""} onChange={event => setDraft({ ...draft, mandateStartDate: event.target.value })} /></div>
        <div className="form-group"><label className="label" htmlFor="minister-end">Fin du mandat</label><input id="minister-end" className="input" type="date" min={draft.mandateStartDate || undefined} max="9999-12-31" value={draft.mandateEndDate ?? ""} onChange={event => setDraft({ ...draft, mandateEndDate: event.target.value || null })} /></div>
        <div className="form-actions"><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le ministre"}</button></div>
      </form>}
      {mandate && <form className="minister-form" onSubmit={updateMandate}>
        <h3 className="minister-form-title">Mandat — {mandate.minister.fullName}</h3>
        <div className="form-group"><label className="label" htmlFor="mandate-start">Début du mandat</label><input id="mandate-start" className="input" type="date" required max="9999-12-31" value={mandate.start} onChange={event => setMandate({ ...mandate, start: event.target.value })} /></div>
        <div className="form-group"><label className="label" htmlFor="mandate-end">Fin du mandat</label><input id="mandate-end" className="input" type="date" min={mandate.start || undefined} max="9999-12-31" value={mandate.end} onChange={event => setMandate({ ...mandate, end: event.target.value })} /></div>
        <div className="form-actions"><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le mandat"}</button><button type="button" className="button button-secondary" disabled={saving} onClick={() => { setMandate(null); setMessage(""); }}>Annuler</button></div>
      </form>}
      <div className="minister-table-wrapper"><table className="minister-table">
        <thead><tr><th>Nom complet</th><th>Sexe</th><th>NIF</th><th>NINU</th><th>Début du mandat</th><th>Fin du mandat</th><th>Statut</th><th aria-label="Actions" /></tr></thead>
        <tbody>{registry.ministers.map(minister => <tr key={minister.id}>
          <td>{minister.fullName}</td><td>{minister.gender}</td><td>{minister.nif}</td><td>{minister.ninu}</td>
          <td>{displayDate(minister.mandateStartDate)}</td><td>{minister.mandateEndDate ? displayDate(minister.mandateEndDate) : minister.mandateStartDate ? "En cours" : "—"}</td>
          <td>{minister.id === registry.currentMinisterId ? "Actuel" : "—"}</td>
          <td><button type="button" className="button button-secondary" disabled={saving} aria-label={`Modifier le mandat de ${minister.fullName}`} onClick={() => { setAdding(false); setMessage(""); setMandate({ minister, start: minister.mandateStartDate ?? "", end: minister.mandateEndDate ?? "" }); }}>Modifier le mandat</button></td>
        </tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}
