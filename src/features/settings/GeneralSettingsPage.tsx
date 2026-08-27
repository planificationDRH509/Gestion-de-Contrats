import { useMemo, useState } from "react";
import { useFiscalYear } from "./settingsApi";
import { Link } from "react-router-dom";
import {
  getDefaultFiscalYearString,
  getFiscalYearOptions,
  isPastFiscalYear
} from "../../lib/contractDateFilters";

export function GeneralSettingsPage() {
  const { localFiscalYear, mode, setPreference } = useFiscalYear();
  const [selectedMode, setSelectedMode] = useState(mode);
  const [inputValue, setInputValue] = useState(localFiscalYear);
  const [saved, setSaved] = useState(false);
  const currentFiscalYear = getDefaultFiscalYearString();
  const fiscalYearOptions = useMemo(() => {
    const options = getFiscalYearOptions();
    return options.includes(inputValue) ? options : [inputValue, ...options];
  }, [inputValue]);
  const selectedFiscalYear = selectedMode === "online" ? currentFiscalYear : inputValue;
  const selectedYearIsPast = isPastFiscalYear(selectedFiscalYear);

  const handleSave = () => {
    setPreference(selectedMode, inputValue);
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

        <div className="form-group fiscal-year-settings">
          <label className="label" htmlFor="fiscal-year-mode">Mode de sélection</label>
          <select
            id="fiscal-year-mode"
            className="select"
            value={selectedMode}
            onChange={(event) => setSelectedMode(event.target.value as "online" | "local")}
          >
            <option value="online">En ligne — année fiscale actuelle</option>
            <option value="local">Local — choix propre à cet ordinateur</option>
          </select>

          <label className="label" htmlFor="fiscal-year-value">Année fiscale appliquée</label>
          <select
            id="fiscal-year-value"
            className={`select ${selectedYearIsPast ? "is-past-fiscal-year" : ""}`}
            value={selectedFiscalYear}
            onChange={(event) => setInputValue(event.target.value)}
            disabled={selectedMode === "online"}
            aria-describedby="fiscal-year-help"
          >
            {selectedMode === "online" ? (
              <option value={currentFiscalYear}>{currentFiscalYear}</option>
            ) : fiscalYearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <p className="helper-text field-help">
            L’exercice {selectedFiscalYear} commence le 1er octobre {selectedFiscalYear.slice(0, 4)} et se termine le 30 septembre {selectedFiscalYear.slice(5)}.
          </p>
          <p id="fiscal-year-help" className="helper-text field-help">
            {selectedMode === "online"
              ? "Le mode en ligne suit automatiquement l’année fiscale actuelle."
              : "Le mode local affecte uniquement les contrats rédigés sur cet ordinateur."}
          </p>
          {selectedYearIsPast ? (
            <div className="fiscal-year-inline-warning" role="alert">
              <span className="material-symbols-rounded">warning</span>
              Cette année fiscale est déjà passée. Les nouveaux contrats seront signalés en rouge.
            </div>
          ) : null}
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
