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
    <div className="page-container settings-detail-page">
      <header className="section-header page-header">
        <div>
          <span className="page-eyebrow">Paramètres</span>
          <h1 className="section-title">Paramètres généraux</h1>
        </div>
        <Link to="/app/parametres" className="button button-secondary">
          <span className="material-symbols-rounded icon">arrow_back</span>
          Retour
        </Link>
      </header>

      <div className="card settings-form-card">
        <div className="card-heading">
           <div className="card-heading-icon">
             <span className="material-symbols-rounded">settings</span>
           </div>
           <h2>Année fiscale</h2>
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
          <p className="helper-text field-help">
            Cette valeur sera automatiquement associée aux nouveaux contrats créés dans le système.
          </p>
        </div>

        <div className="form-actions settings-form-actions">
          <button className="button button-primary" onClick={handleSave}>
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
