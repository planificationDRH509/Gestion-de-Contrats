import { useTheme } from "../../app/providers/ThemeProvider";

export function DisplaySettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="page-container settings-detail-page">
      <div className="section-header page-header">
        <div>
          <span className="page-eyebrow">Paramètres</span>
          <h1 className="section-title">Affichage</h1>
          <p className="section-subtitle">Choisissez une apparence confortable pour votre environnement de travail.</p>
        </div>
      </div>

      <div className="card settings-form-card appearance-card">
        <h2 className="card-title">Mode d'apparence</h2>
        <p className="card-description">
          Choisissez comment l'application s'affiche pour vous. Le mode sombre réduit la fatigue oculaire dans les environnements peu éclairés.
        </p>

        <div className="appearance-options">
          <button
            onClick={() => setTheme('light')}
            className={`appearance-option${theme === 'light' ? ' active' : ''}`}
          >
            <div className="appearance-preview light-preview">
              <span className="material-symbols-rounded">light_mode</span>
            </div>
            <span>Clair</span>
            <small>Fond lumineux et contrastes doux</small>
          </button>

          <button
            onClick={() => setTheme('dark')}
            className={`appearance-option${theme === 'dark' ? ' active' : ''}`}
          >
            <div className="appearance-preview dark-preview">
              <span className="material-symbols-rounded">dark_mode</span>
            </div>
            <span>Sombre</span>
            <small>Confort visuel en faible luminosité</small>
          </button>
        </div>
      </div>
    </div>
  );
}
