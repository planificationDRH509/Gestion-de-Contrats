import { useState } from "react";
import { useAuth } from "../auth/auth";
import { 
  useAddresses, usePositions, useInstitutions,
  useAddAddress, useAddPosition, useAddInstitution,
  useUpdateAddress, useUpdatePosition, useUpdateInstitution
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
  const updateMutation = useUpdateAddress();
  const [newLabel, setNewLabel] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [editLabelFeminine, setEditLabelFeminine] = useState("");
  const repo = getDataProvider().suggestions;

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const res = await addMutation.mutateAsync({ workspaceId, label: newLabel.trim() });
    if (newPrefix.trim()) {
      await updateMutation.mutateAsync({ id: res.id, label: res.label, prefix: newPrefix.trim() });
    }
    setNewLabel("");
    setNewPrefix("");
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)" }}>location_on</span>
        <strong>Adresses</strong>
      </div>
      <div className="sug-add-row sug-add-row-multi">
        <input className="input" value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)} placeholder="Préf." style={{ width: 60 }} title="Préfixe (ex: à)" />
        <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nouvelle adresse..." style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={addMutation.isPending}>Ajouter</button>
      </div>
      <div className="sug-list">
        {isLoading && <div className="sug-empty">Chargement...</div>}
        {items.map(item => (
          <div key={item.id} className="sug-item" style={{ flexDirection: editId === item.id ? 'column' : 'row', alignItems: editId === item.id ? 'stretch' : 'center', gap: 4 }}>
            {editId === item.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={editPrefix} onChange={e => setEditPrefix(e.target.value)} placeholder="Préf." style={{ width: 60 }} />
                  <input className="input" autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ flex: 1 }} placeholder="Label" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={editLabelFeminine} onChange={e => setEditLabelFeminine(e.target.value)} placeholder="Équiv. féminin (facultatif)" style={{ flex: 1 }} title="Équivalent féminin" />
                  <button className="icon-btn" onClick={async () => {
                     if(editLabel.trim()) {
                       await updateMutation.mutateAsync({ 
                         id: item.id, 
                         label: editLabel.trim(), 
                         prefix: editPrefix.trim() || null, 
                         labelFeminine: editLabelFeminine.trim() || null 
                       });
                     }
                     setEditId(null);
                  }}><span className="material-symbols-rounded">check</span></button>
                  <button className="icon-btn" onClick={() => setEditId(null)}><span className="material-symbols-rounded">close</span></button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  {item.prefix && <span style={{ opacity: 0.5, marginRight: 4 }}>{item.prefix}</span>}
                  <span className="sug-item-label">{item.label}</span>
                  {item.labelFeminine && <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>(f: {item.labelFeminine})</span>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="icon-btn" onClick={() => { 
                    setEditId(item.id); 
                    setEditLabel(item.label); 
                    setEditPrefix(item.prefix || ""); 
                    setEditLabelFeminine(item.labelFeminine || "");
                  }}><span className="material-symbols-rounded">edit</span></button>
                  <button className="icon-btn" onClick={async () => { if(confirm("Supprimer ?")) { await repo.deleteAddress(item.id); window.location.reload(); } }}><span className="material-symbols-rounded">delete</span></button>
                </div>
              </>
            )}
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
  const updateMutation = useUpdatePosition();
  const [newLabel, setNewLabel] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSalary, setEditSalary] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [editLabelFeminine, setEditLabelFeminine] = useState("");
  const repo = getDataProvider().suggestions;

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const res = await addMutation.mutateAsync({ workspaceId, label: newLabel.trim(), defaultSalary: parseInt(newSalary) || 0 });
    if (newPrefix.trim()) {
       await updateMutation.mutateAsync({ 
         id: res.id, 
         label: res.label, 
         defaultSalary: res.defaultSalary, 
         prefix: newPrefix.trim() 
       });
    }
    setNewLabel("");
    setNewSalary("");
    setNewPrefix("");
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)" }}>badge</span>
        <strong>Postes</strong>
      </div>
      <div className="sug-add-row sug-add-row-multi" style={{ gap: 4 }}>
        <input className="input" value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)} placeholder="Préf." style={{ width: 60 }} />
        <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Poste..." style={{ flex: 2 }} />
        <input className="input" value={newSalary} onChange={(e) => setNewSalary(e.target.value)} placeholder="Salaire" style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={handleAdd}>Ajouter</button>
      </div>
      <div className="sug-list">
        {items.map(item => (
          <div key={item.id} className="sug-item" style={{ flexDirection: editId === item.id ? 'column' : 'row', alignItems: editId === item.id ? 'stretch' : 'center', gap: 4 }}>
            {editId === item.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={editPrefix} onChange={e => setEditPrefix(e.target.value)} placeholder="Préf." style={{ width: 60 }} />
                  <input className="input" autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ flex: 2 }} placeholder="Poste" />
                  <input className="input" value={editSalary} onChange={e => setEditSalary(e.target.value)} style={{ flex: 1 }} placeholder="Salaire" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={editLabelFeminine} onChange={e => setEditLabelFeminine(e.target.value)} placeholder="Équivalent féminin" style={{ flex: 1 }} />
                  <button className="icon-btn" onClick={async () => {
                     if(editLabel.trim()) {
                       await updateMutation.mutateAsync({ 
                         id: item.id, 
                         label: editLabel.trim(), 
                         defaultSalary: parseInt(editSalary)||0,
                         prefix: editPrefix.trim() || null,
                         labelFeminine: editLabelFeminine.trim() || null
                       });
                     }
                     setEditId(null);
                  }}><span className="material-symbols-rounded">check</span></button>
                  <button className="icon-btn" onClick={() => setEditId(null)}><span className="material-symbols-rounded">close</span></button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  {item.prefix && <span style={{ opacity: 0.5, marginRight: 4 }}>{item.prefix}</span>}
                  <span className="sug-item-label">{item.label} ({item.defaultSalary} HTG)</span>
                  {item.labelFeminine && <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>(f: {item.labelFeminine})</span>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="icon-btn" onClick={() => { 
                    setEditId(item.id); 
                    setEditLabel(item.label); 
                    setEditSalary(item.defaultSalary.toString()); 
                    setEditPrefix(item.prefix || "");
                    setEditLabelFeminine(item.labelFeminine || "");
                  }}><span className="material-symbols-rounded">edit</span></button>
                  <button className="icon-btn" onClick={async () => { if(confirm("Supprimer ?")) { await repo.deletePosition(item.id); window.location.reload(); } }}><span className="material-symbols-rounded">delete</span></button>
                </div>
              </>
            )}
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
  const updateMutation = useUpdateInstitution();
  const [newLabel, setNewLabel] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [editLabelFeminine, setEditLabelFeminine] = useState("");
  const repo = getDataProvider().suggestions;

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const res = await addMutation.mutateAsync({ 
      workspaceId, 
      label: newLabel.trim(), 
      addressKeywords: newKeywords.split(",").map(k => k.trim()).filter(Boolean) 
    });
    if (newPrefix.trim()) {
      await updateMutation.mutateAsync({
        id: res.id,
        label: res.label,
        addressKeywords: res.addressKeywords,
        prefix: newPrefix.trim()
      });
    }
    setNewLabel("");
    setNewKeywords("");
    setNewPrefix("");
  }

  return (
    <div>
      <div className="sug-panel-header">
        <span className="material-symbols-rounded" style={{ color: "var(--accent)" }}>account_balance</span>
        <strong>Institutions</strong>
      </div>
      <div className="sug-add-row sug-add-row-multi" style={{ gap: 4 }}>
        <input className="input" value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)} placeholder="Préf." style={{ width: 60 }} />
        <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nom de l'institution..." style={{ flex: 2 }} />
        <input className="input" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="villes (ex: delmas, tabarre)" style={{ flex: 1.5 }} />
        <button type="button" className="btn btn-primary" onClick={handleAdd}>Ajouter</button>
      </div>
      <div className="sug-list">
        {items.map(item => (
          <div key={item.id} className="sug-item" style={{ flexDirection: editId === item.id ? 'column' : 'row', alignItems: editId === item.id ? 'stretch' : 'center', gap: 4 }}>
            {editId === item.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={editPrefix} onChange={e => setEditPrefix(e.target.value)} placeholder="Préf." style={{ width: 60 }} />
                  <input className="input" autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ flex: 2 }} placeholder="Nom" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                   <input className="input" value={editKeywords} onChange={e => setEditKeywords(e.target.value)} style={{ flex: 2 }} placeholder="mots-clés (villes)" />
                   <input className="input" value={editLabelFeminine} onChange={e => setEditLabelFeminine(e.target.value)} placeholder="Équivalent féminin" style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="icon-btn" onClick={async () => {
                     if(editLabel.trim()) {
                       await updateMutation.mutateAsync({ 
                          id: item.id, 
                          label: editLabel.trim(), 
                          addressKeywords: editKeywords.split(",").map(k => k.trim()).filter(Boolean),
                          prefix: editPrefix.trim() || null,
                          labelFeminine: editLabelFeminine.trim() || null
                       });
                     }
                     setEditId(null);
                  }}><span className="material-symbols-rounded">check</span></button>
                  <button className="icon-btn" onClick={() => setEditId(null)}><span className="material-symbols-rounded">close</span></button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  {item.prefix && <span style={{ opacity: 0.5, marginRight: 4 }}>{item.prefix}</span>}
                  <span className="sug-item-label">
                    {item.label} 
                    {item.addressKeywords && item.addressKeywords.length > 0 && <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>({item.addressKeywords.join(", ")})</span>}
                    {item.labelFeminine && <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>(f: {item.labelFeminine})</span>}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="icon-btn" onClick={() => { 
                    setEditId(item.id); 
                    setEditLabel(item.label); 
                    setEditKeywords((item.addressKeywords||[]).join(", ")); 
                    setEditPrefix(item.prefix || "");
                    setEditLabelFeminine(item.labelFeminine || "");
                  }}><span className="material-symbols-rounded">edit</span></button>
                  <button className="icon-btn" onClick={async () => { if(confirm("Supprimer ?")) { await repo.deleteInstitution(item.id); window.location.reload(); } }}><span className="material-symbols-rounded">delete</span></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
