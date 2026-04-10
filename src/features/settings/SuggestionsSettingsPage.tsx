import { useCallback, useEffect, useState } from "react";
import {
  getAddresses,
  getPositions,
  getInstitutions,
  addAddress,
  updateAddress,
  deleteAddress,
  addPosition,
  updatePosition,
  deletePosition,
  addInstitution,
  updateInstitution,
  deleteInstitution,
  type AddressSuggestion,
  type PositionSuggestion,
  type InstitutionSuggestion,
} from "../../data/local/suggestionsDb";

type Tab = "addresses" | "positions" | "institutions";

export function SuggestionsSettingsPage() {
  const [tab, setTab] = useState<Tab>("addresses");

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">Suggestions & Auto-complétion</div>
          <p className="helper-text" style={{ marginTop: 4 }}>
            Gérez les listes de suggestions pour les formulaires de contrats.
          </p>
        </div>
      </div>

      <div className="suggestions-tabs">
        <button
          type="button"
          className={`suggestions-tab${tab === "addresses" ? " active" : ""}`}
          onClick={() => setTab("addresses")}
        >
          <span className="material-symbols-rounded">location_on</span>
          Adresses
        </button>
        <button
          type="button"
          className={`suggestions-tab${tab === "positions" ? " active" : ""}`}
          onClick={() => setTab("positions")}
        >
          <span className="material-symbols-rounded">badge</span>
          Postes & Salaires
        </button>
        <button
          type="button"
          className={`suggestions-tab${tab === "institutions" ? " active" : ""}`}
          onClick={() => setTab("institutions")}
        >
          <span className="material-symbols-rounded">account_balance</span>
          Institutions (Affectation)
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {tab === "addresses" && <AddressesPanel />}
        {tab === "positions" && <PositionsPanel />}
        {tab === "institutions" && <InstitutionsPanel />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Addresses Panel
   ═══════════════════════════════════════════ */
function AddressesPanel() {
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const refresh = useCallback(() => setItems(getAddresses()), []);
  useEffect(() => {
    refresh();
    window.addEventListener("contribution_suggestions_updated", refresh);
    return () => window.removeEventListener("contribution_suggestions_updated", refresh);
  }, [refresh]);

  function handleAdd() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    addAddress(trimmed);
    setNewLabel("");
    refresh();
  }

  function handleStartEdit(item: AddressSuggestion) {
    setEditId(item.id);
    setEditLabel(item.label);
  }

  function handleSaveEdit() {
    if (editId && editLabel.trim()) {
      updateAddress(editId, editLabel.trim());
      setEditId(null);
      setEditLabel("");
      refresh();
    }
  }

  function handleDelete(id: string) {
    deleteAddress(id);
    refresh();
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)", fontSize: 22 }}>location_on</span>
        <div>
          <strong>Adresses disponibles</strong>
          <p className="helper-text">Suggestions pour le champ « Adresse » dans le formulaire de contrat.</p>
        </div>
      </div>

      <div className="sug-add-row">
        <input
          className="input"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Ajouter une adresse…"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); }}}
        />
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={!newLabel.trim()}>
          <span className="material-symbols-rounded icon">add</span>
          Ajouter
        </button>
      </div>

      <div className="sug-list">
        {items.map((item) => (
          <div key={item.id} className="sug-item">
            {editId === item.id ? (
              <div className="sug-edit-row">
                <input
                  className="input"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }}}
                  autoFocus
                />
                <button type="button" className="icon-btn primary" onClick={handleSaveEdit} title="Sauvegarder">
                  <span className="material-symbols-rounded">check</span>
                </button>
                <button type="button" className="icon-btn" onClick={() => setEditId(null)} title="Annuler">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
            ) : (
              <>
                <div className="sug-item-content">
                  <span className="material-symbols-rounded sug-item-icon">location_on</span>
                  <span className="sug-item-label">{item.label}</span>
                </div>
                <div className="sug-item-actions">
                  <button type="button" className="icon-btn" onClick={() => handleStartEdit(item)} title="Modifier">
                    <span className="material-symbols-rounded">edit</span>
                  </button>
                  <button type="button" className="icon-btn" onClick={() => handleDelete(item.id)} title="Supprimer">
                    <span className="material-symbols-rounded">delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="sug-empty">Aucune adresse enregistrée. Ajoutez-en une ci-dessus.</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Positions Panel
   ═══════════════════════════════════════════ */
function PositionsPanel() {
  const [items, setItems] = useState<PositionSuggestion[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSalary, setEditSalary] = useState("");

  const refresh = useCallback(() => setItems(getPositions()), []);
  useEffect(() => {
    refresh();
    window.addEventListener("contribution_suggestions_updated", refresh);
    return () => window.removeEventListener("contribution_suggestions_updated", refresh);
  }, [refresh]);

  function handleAdd() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const salary = parseInt(newSalary, 10) || 0;
    addPosition(trimmed, salary);
    setNewLabel("");
    setNewSalary("");
    refresh();
  }

  function handleStartEdit(item: PositionSuggestion) {
    setEditId(item.id);
    setEditLabel(item.label);
    setEditSalary(item.defaultSalary.toString());
  }

  function handleSaveEdit() {
    if (editId && editLabel.trim()) {
      updatePosition(editId, editLabel.trim(), parseInt(editSalary, 10) || 0);
      setEditId(null);
      refresh();
    }
  }

  function handleDelete(id: string) {
    deletePosition(id);
    refresh();
  }

  function formatHTG(n: number): string {
    return n.toLocaleString("fr-HT") + " HTG";
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)", fontSize: 22 }}>badge</span>
        <div>
          <strong>Postes & Salaires par défaut</strong>
          <p className="helper-text">Chaque poste peut avoir un salaire par défaut qui sera suggéré automatiquement lors de la saisie.</p>
        </div>
      </div>

      <div className="sug-add-row sug-add-row-multi">
        <input
          className="input"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nom du poste…"
          style={{ flex: 2 }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); }}}
        />
        <input
          className="input"
          value={newSalary}
          onChange={(e) => setNewSalary(e.target.value.replace(/\D/g, ""))}
          placeholder="Salaire HTG"
          inputMode="numeric"
          style={{ flex: 1 }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); }}}
        />
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={!newLabel.trim()}>
          <span className="material-symbols-rounded icon">add</span>
          Ajouter
        </button>
      </div>

      <div className="sug-list">
        {items.map((item) => (
          <div key={item.id} className="sug-item">
            {editId === item.id ? (
              <div className="sug-edit-row sug-edit-row-multi">
                <input
                  className="input"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  autoFocus
                  style={{ flex: 2 }}
                />
                <input
                  className="input"
                  value={editSalary}
                  onChange={(e) => setEditSalary(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }}}
                />
                <button type="button" className="icon-btn primary" onClick={handleSaveEdit} title="Sauvegarder">
                  <span className="material-symbols-rounded">check</span>
                </button>
                <button type="button" className="icon-btn" onClick={() => setEditId(null)} title="Annuler">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
            ) : (
              <>
                <div className="sug-item-content">
                  <span className="material-symbols-rounded sug-item-icon">badge</span>
                  <div>
                    <span className="sug-item-label">{item.label}</span>
                    {item.defaultSalary > 0 && (
                      <span className="sug-salary-badge">{formatHTG(item.defaultSalary)}</span>
                    )}
                  </div>
                </div>
                <div className="sug-item-actions">
                  <button type="button" className="icon-btn" onClick={() => handleStartEdit(item)} title="Modifier">
                    <span className="material-symbols-rounded">edit</span>
                  </button>
                  <button type="button" className="icon-btn" onClick={() => handleDelete(item.id)} title="Supprimer">
                    <span className="material-symbols-rounded">delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="sug-empty">Aucun poste enregistré. Ajoutez-en un ci-dessus.</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Institutions Panel
   ═══════════════════════════════════════════ */
function InstitutionsPanel() {
  const [items, setItems] = useState<InstitutionSuggestion[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editKeywords, setEditKeywords] = useState("");

  const refresh = useCallback(() => setItems(getInstitutions()), []);
  useEffect(() => {
    refresh();
    window.addEventListener("contribution_suggestions_updated", refresh);
    return () => window.removeEventListener("contribution_suggestions_updated", refresh);
  }, [refresh]);

  function parseKeywords(s: string): string[] {
    return s
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
  }

  function handleAdd() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    addInstitution(trimmed, parseKeywords(newKeywords));
    setNewLabel("");
    setNewKeywords("");
    refresh();
  }

  function handleStartEdit(item: InstitutionSuggestion) {
    setEditId(item.id);
    setEditLabel(item.label);
    setEditKeywords(item.addressKeywords.join(", "));
  }

  function handleSaveEdit() {
    if (editId && editLabel.trim()) {
      updateInstitution(editId, editLabel.trim(), parseKeywords(editKeywords));
      setEditId(null);
      refresh();
    }
  }

  function handleDelete(id: string) {
    deleteInstitution(id);
    refresh();
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)", fontSize: 22 }}>account_balance</span>
        <div>
          <strong>Institutions & Affectations</strong>
          <p className="helper-text">
            Liez chaque institution à des mots-clés d'adresse (séparés par des virgules) pour
            les proposer intelligemment selon l'adresse saisie dans le formulaire.
          </p>
        </div>
      </div>

      <div className="sug-add-row sug-add-row-multi">
        <input
          className="input"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nom de l'institution…"
          style={{ flex: 2 }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); }}}
        />
        <input
          className="input"
          value={newKeywords}
          onChange={(e) => setNewKeywords(e.target.value)}
          placeholder="Mots-clés adresse (ex: delmas, tabarre)"
          style={{ flex: 2 }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); }}}
        />
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={!newLabel.trim()}>
          <span className="material-symbols-rounded icon">add</span>
          Ajouter
        </button>
      </div>

      <div className="sug-list">
        {items.map((item) => (
          <div key={item.id} className="sug-item">
            {editId === item.id ? (
              <div className="sug-edit-row sug-edit-row-multi">
                <input
                  className="input"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  autoFocus
                  style={{ flex: 2 }}
                />
                <input
                  className="input"
                  value={editKeywords}
                  onChange={(e) => setEditKeywords(e.target.value)}
                  placeholder="Mots-clés adresse"
                  style={{ flex: 2 }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }}}
                />
                <button type="button" className="icon-btn primary" onClick={handleSaveEdit} title="Sauvegarder">
                  <span className="material-symbols-rounded">check</span>
                </button>
                <button type="button" className="icon-btn" onClick={() => setEditId(null)} title="Annuler">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
            ) : (
              <>
                <div className="sug-item-content">
                  <span className="material-symbols-rounded sug-item-icon">account_balance</span>
                  <div>
                    <span className="sug-item-label">{item.label}</span>
                    {item.addressKeywords.length > 0 && (
                      <div className="sug-keywords">
                        {item.addressKeywords.map((kw, i) => (
                          <span key={i} className="sug-keyword-tag">{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="sug-item-actions">
                  <button type="button" className="icon-btn" onClick={() => handleStartEdit(item)} title="Modifier">
                    <span className="material-symbols-rounded">edit</span>
                  </button>
                  <button type="button" className="icon-btn" onClick={() => handleDelete(item.id)} title="Supprimer">
                    <span className="material-symbols-rounded">delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="sug-empty">Aucune institution enregistrée. Ajoutez-en une ci-dessus.</div>
        )}
      </div>
    </div>
  );
}
