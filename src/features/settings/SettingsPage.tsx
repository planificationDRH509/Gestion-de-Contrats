import { Link } from "react-router-dom";

export function SettingsPage() {
  return (
    <div className="page-container" style={{ animation: 'fade-in 0.4s var(--premium-ease)' }}>
      <header className="section-header" style={{ background: 'transparent' }}>
        <div>
          <h1 className="section-title" style={{ fontSize: '28px' }}>Paramètres</h1>
          <p className="section-subtitle">Configuration et personnalisation de votre espace de travail.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px', marginTop: '12px' }}>
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
    <Link to={to} className="card" style={{ 
      display: 'flex', 
      gap: '20px', 
      alignItems: 'center', 
      padding: '24px',
      textDecoration: 'none',
      color: 'inherit',
      transition: 'all 0.3s var(--premium-ease)'
    }}>
      <div style={{ 
        width: '56px', 
        height: '56px', 
        borderRadius: '14px', 
        background: 'var(--accent-soft)', 
        color: 'var(--accent)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <span className="material-symbols-rounded" style={{ fontSize: '28px' }}>{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: 'var(--ink)', fontFamily: 'var(--font-heading)' }}>{title}</h3>
        <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'var(--ink-muted)', lineHeight: '1.6' }}>{description}</p>
      </div>
      <span className="material-symbols-rounded" style={{ color: 'var(--border)', fontSize: '22px' }}>chevron_right</span>
    </Link>
  );
}
