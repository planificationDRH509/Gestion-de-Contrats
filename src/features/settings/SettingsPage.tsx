import { Link } from "react-router-dom";

export function SettingsPage() {
  return (
    <div className="content">
      <div className="section-header">
        <h1 className="section-title">Paramètres</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginTop: '20px' }}>
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
      </div>
    </div>
  );
}

function SettingsCard({ to, icon, title, description }: { to: string, icon: string, title: string, description: string }) {
  return (
    <Link to={to} className="card settings-navigation-card" style={{ 
      display: 'flex', 
      gap: '20px', 
      alignItems: 'center', 
      padding: '24px',
      textDecoration: 'none',
      color: 'inherit',
    }}>
      <div style={{ 
        width: '60px', 
        height: '60px', 
        borderRadius: '16px', 
        background: 'var(--accent-soft)', 
        color: 'var(--accent)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <span className="material-symbols-rounded" style={{ fontSize: '32px' }}>{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--ink)' }}>{title}</h3>
        <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--ink-muted)', lineHeight: '1.5' }}>{description}</p>
      </div>
      <span className="material-symbols-rounded" style={{ color: 'var(--border)', fontSize: '24px' }}>chevron_right</span>
    </Link>
  );
}
