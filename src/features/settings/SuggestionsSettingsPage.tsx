import { useState } from "react";
import { useAuth } from "../auth/auth";
import { 
  useAddresses, usePositions, useInstitutions,
  useAddAddress, useAddPosition, useAddInstitution 
} from "./suggestionsApi";
import { getDataProvider } from "../../data/dataProvider";
import { loadSuggestions } from "../../data/local/suggestionsDb";

type Tab = "addresses" | "positions" | "institutions";

export function SuggestionsSettingsPage() {
  const [tab, setTab] = useState<Tab>("addresses");

  return (
    <div>
      <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="section-title">Suggestions & Auto-complétion</div>
          <p className="helper-text" style={{ marginTop: 4 }}>
            Gérez les listes de suggestions partagées via Supabase.
          </p>
        </div>
        <MigrateButton />
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

function MigrateButton() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId || "";
  const addAddress = useAddAddress();
  const addPosition = useAddPosition();
  const addInstitution = useAddInstitution();
  const [isMigrating, setIsMigrating] = useState(false);

  async function handleMigrate() {
    if (!confirm("Voulez-vous importer vos suggestions locales vers Supabase ? Cela peut créer des doublons.")) return;
    setIsMigrating(true);
    try {
      const localDb = loadSuggestions();
      for (const a of localDb.addresses) {
        await addAddress.mutateAsync({ workspaceId, label: a.label });
      }
      for (const p of localDb.positions) {
        await addPosition.mutateAsync({ workspaceId, label: p.label, defaultSalary: p.defaultSalary });
      }
      for (const i of localDb.institutions) {
        await addInstitution.mutateAsync({ workspaceId, label: i.label, addressKeywords: i.addressKeywords });
      }
      alert("Migration terminée avec succès !");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue pendant la migration.");
    } finally {
      setIsMigrating(false);
    }
  }

  return (
    <button className="btn btn-secondary" onClick={handleMigrate} disabled={isMigrating} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="material-symbols-rounded">{isMigrating ? "sync" : "cloud_upload"}</span>
      {isMigrating ? "Importation..." : "Importer les suggestions locales"}
    </button>
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
