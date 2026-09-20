import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth";

export function SettingsPage() {
  const { can } = useAuth();

  return (
    <div className="page-container settings-page">
      <header className="section-header">
        <div>
          <span className="page-eyebrow">Compte</span>
          <h1 className="section-title">Paramètres</h1>
        </div>
      </header>

      <div className="settings-grid">
        <SettingsCard
          to="/app/parametres/mot-de-passe"
          icon="password"
          title="Mot de passe"
          description="Modifiez le mot de passe de votre compte connecté."
        />
        {can("settings.manage") ? (
          <>
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
              to="/app/parametres/corbeille"
              icon="delete_sweep"
              title="Corbeille"
              description="Consultez les contrats qui ont été supprimés."
            />
            <SettingsCard
              to="/app/parametres/utilisateurs"
              icon="group"
              title="Utilisateurs"
              description="Créez et consultez les comptes des collaborateurs."
            />
            <SettingsCard
              to="/app/controle-qualite"
              icon="fact_check"
              title="Contrôle qualité"
              description="Vérifiez la qualité des données et corrigez les anomalies détectées."
            />
            <SettingsCard
              to="/app/audit"
              icon="history"
              title="Journal d’audit"
              description="Consultez l’historique des créations, modifications et suppressions."
            />
          </>
        ) : null}
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
