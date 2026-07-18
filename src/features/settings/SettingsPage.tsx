import { Link } from "react-router-dom";

export function SettingsPage() {
  return (
    <div className="page-container settings-page">
      <header className="section-header">
        <div>
          <span className="page-eyebrow">Administration</span>
          <h1 className="section-title">Paramètres</h1>
          <p className="section-subtitle">Configuration et personnalisation de votre espace de travail.</p>
        </div>
      </header>

      <div className="settings-grid">
        <SettingsCard 
          to="/app/parametres/general" 
          icon="settings" 
          title="Général" 
          description="Paramètres globaux tels que l'année fiscale courante."
        />
        <SettingsCard 
          to="/app/parametres/affichage" 
          icon="palette" 
          title="Affichage" 
          description="Personnalisez l'apparence de l'application (mode sombre, thèmes, etc.)."
        />
        <SettingsCard 
          to="/app/parametres/draft-html" 
          icon="data_object" 
          title="Modèle HTML" 
          description="Personnalisez la structure et le contenu HTML par défaut pour vos contrats."
        />
        <SettingsCard 
          to="/app/parametres/suggestions" 
          icon="auto_awesome" 
          title="Suggestions" 
          description="Gérez les listes de suggestions automatiques pour les champs du formulaire."
        />
        <SettingsCard
          to="/app/parametres/backup-sql"
          icon="database"
          title="Backup SQL"
          description="Exportez la base SQLite locale en fichier SQL pour sauvegarde."
        />
        <SettingsCard
          to="/app/parametres/utilisateurs"
          icon="group"
          title="Utilisateurs"
          description="Gérez les comptes utilisateurs et leurs permissions d'accès aux espaces de travail."
        />
      </div>
    </div>
  );
}

function SettingsCard({ to, icon, title, description }: { to: string, icon: string, title: string, description: string }) {
  return (
    <Link to={to} className="settings-card">
      <div className="settings-card-icon">
        <span className="material-symbols-rounded">{icon}</span>
      </div>
      <div className="settings-card-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span className="material-symbols-rounded settings-card-arrow">arrow_forward</span>
    </Link>
  );
}
