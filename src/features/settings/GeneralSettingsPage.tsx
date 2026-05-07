import { useState } from "react";
import { useFiscalYear } from "./settingsApi";
import { Link } from "react-router-dom";

export function GeneralSettingsPage() {
  const { fiscalYear, setFiscalYear } = useFiscalYear();
  const [inputValue, setInputValue] = useState(fiscalYear);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setFiscalYear(inputValue);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="page-container" style={{ animation: 'fade-in 0.4s var(--premium-ease)' }}>
      <header className="section-header" style={{ background: 'transparent' }}>
        <div>
          <h1 className="section-title" style={{ fontSize: '28px' }}>Paramètres Généraux</h1>
          <p className="section-subtitle">Configuration globale de l'application.</p>
        </div>
        <Link to="/app/parametres" className="button button-secondary" style={{ marginLeft: "auto", display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>arrow_back</span>
          Retour
        </Link>
      </header>

      <div className="card" style={{ padding: "32px", maxWidth: "640px", marginTop: "12px" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
           <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <span className="material-symbols-rounded">settings</span>
           </div>
           <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-heading)' }}>Année Fiscale</h2>
        </div>

        <div className="form-group">
          <label className="label">Valeur par défaut</label>
          <input
            type="text"
            className="input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="ex: 2023-2024"
            style={{ height: '44px' }}
          />
          <p style={{ fontSize: "13px", color: "var(--ink-muted)", marginTop: "10px", lineHeight: '1.5' }}>
            Cette valeur sera automatiquement associée aux nouveaux contrats créés dans le système.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "32px" }}>
          <button className="button button-primary" onClick={handleSave} style={{ height: '44px', padding: '0 24px', fontWeight: '600' }}>
            Sauvegarder les modifications
          </button>
          {saved && (
            <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: "6px", fontSize: '14px', fontWeight: '500' }}>
              <span className="material-symbols-rounded" style={{ fontSize: "20px" }}>check_circle</span>
              Enregistré avec succès
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
