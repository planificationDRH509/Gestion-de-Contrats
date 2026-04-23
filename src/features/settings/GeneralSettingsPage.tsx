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
    <div className="content">
      <div className="section-header">
        <h1 className="section-title">Paramètres Généraux</h1>
        <Link to="/app/parametres" className="btn btn-secondary" style={{ marginLeft: "auto" }}>
          Retour
        </Link>
      </div>

      <div className="card" style={{ padding: "24px", maxWidth: "600px", marginTop: "24px" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.2rem", marginBottom: "16px" }}>
          Configuration globale
        </h2>

        <div className="form-group">
          <label>Année fiscale courante</label>
          <input
            type="text"
            className="input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="ex: 2023-2024"
          />
          <p className="help-text" style={{ fontSize: "0.85rem", color: "var(--ink-muted)", marginTop: "8px" }}>
            Cette valeur sera utilisée par défaut comme année fiscale lors de la création de nouveaux contrats.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "24px" }}>
          <button className="btn btn-primary" onClick={handleSave}>
            Sauvegarder
          </button>
          {saved && (
            <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: "4px" }}>
              <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>check_circle</span>
              Paramètres enregistrés
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
