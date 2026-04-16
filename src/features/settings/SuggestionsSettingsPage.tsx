import { useState } from "react";
import { useAuth } from "../auth/auth";
import { 
  useAddresses, usePositions, useInstitutions,
  useAddAddress, useAddPosition, useAddInstitution 
} from "./suggestionsApi";
import { getDataProvider } from "../../data/dataProvider";


type Tab = "addresses" | "positions" | "institutions";

export function SuggestionsSettingsPage() {
  const [tab, setTab] = useState<Tab>("addresses");

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">Suggestions & Auto-complétion</div>
          <p className="helper-text" style={{ marginTop: 4 }}>
            Gérez les listes de suggestions partagées via Supabase.
          </p>
        </div>
      </div>

      <div className="suggestions-tabs">
        <button type="button" className={`suggestions-tab${tab === "addresses" ? " active" : ""}`} onClick={() => setTab("addresses")}>
          <span className="material-symbols-rounded">location_on</span> Adresses
        </button>
        <button type="button" className={`suggestions-tab${tab === "positions" ? " active" : ""}`} onClick={() => setTab("positions")}>
          <span className="material-symbols-rounded">badge</span> Postes
        </button>
        <button type="button" className={`suggestions-tab${tab === "institutions" ? " active" : ""}`} onClick={() => setTab("institutions")}>
          <span className="material-symbols-rounded">account_balance</span> Institutions
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

function AddressesPanel() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId || "";
  const { data: items = [], isLoading } = useAddresses(workspaceId);
  const addMutation = useAddAddress();
  const [newLabel, setNewLabel] = useState("");
  const repo = getDataProvider().suggestions;

  async function handleAdd() {
    if (!newLabel.trim()) return;
    await addMutation.mutateAsync({ workspaceId, label: newLabel.trim() });
    setNewLabel("");
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)" }}>location_on</span>
        <strong>Adresses</strong>
      </div>
      <div className="sug-add-row">
        <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nouvelle adresse..." />
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={addMutation.isPending}>Ajouter</button>
      </div>
      <div className="sug-list">
        {isLoading && <div className="sug-empty">Chargement...</div>}
        {items.map(item => (
          <div key={item.id} className="sug-item">
            <span className="sug-item-label">{item.label}</span>
            <button className="icon-btn" onClick={async () => { if(confirm("Supprimer ?")) { await repo.deleteAddress(item.id); window.location.reload(); } }}><span className="material-symbols-rounded">delete</span></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PositionsPanel() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId || "";
  const { data: items = [] } = usePositions(workspaceId);
  const addMutation = useAddPosition();
  const [newLabel, setNewLabel] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const repo = getDataProvider().suggestions;

  async function handleAdd() {
    if (!newLabel.trim()) return;
    await addMutation.mutateAsync({ workspaceId, label: newLabel.trim(), defaultSalary: parseInt(newSalary) || 0 });
    setNewLabel("");
    setNewSalary("");
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)" }}>badge</span>
        <strong>Postes</strong>
      </div>
      <div className="sug-add-row sug-add-row-multi">
        <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Poste..." style={{ flex: 2 }} />
        <input className="input" value={newSalary} onChange={(e) => setNewSalary(e.target.value)} placeholder="Salaire" style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={handleAdd}>Ajouter</button>
      </div>
      <div className="sug-list">
        {items.map(item => (
          <div key={item.id} className="sug-item">
            <span className="sug-item-label">{item.label} ({item.defaultSalary} HTG)</span>
            <button className="icon-btn" onClick={async () => { if(confirm("Supprimer ?")) { await repo.deletePosition(item.id); window.location.reload(); } }}><span className="material-symbols-rounded">delete</span></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstitutionsPanel() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId || "";
  const { data: items = [] } = useInstitutions(workspaceId);
  const addMutation = useAddInstitution();
  const [newLabel, setNewLabel] = useState("");
  const repo = getDataProvider().suggestions;

  async function handleAdd() {
    if (!newLabel.trim()) return;
    await addMutation.mutateAsync({ workspaceId, label: newLabel.trim(), addressKeywords: [] });
    setNewLabel("");
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)" }}>account_balance</span>
        <strong>Institutions</strong>
      </div>
      <div className="sug-add-row">
        <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nom..." />
        <button type="button" className="btn btn-primary" onClick={handleAdd}>Ajouter</button>
      </div>
      <div className="sug-list">
        {items.map(item => (
          <div key={item.id} className="sug-item">
            <span className="sug-item-label">{item.label}</span>
            <button className="icon-btn" onClick={async () => { if(confirm("Supprimer ?")) { await repo.deleteInstitution(item.id); window.location.reload(); } }}><span className="material-symbols-rounded">delete</span></button>
          </div>
        ))}
      </div>
    </div>
  );
}
