import { useTheme } from "../../app/providers/ThemeProvider";

export function DisplaySettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="content">
      <div className="section-header">
        <h1 className="section-title">Affichage</h1>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: 'var(--ink)' }}>Mode d'apparence</h2>
        <p style={{ color: 'var(--ink-muted)', marginBottom: '24px', fontSize: '14px' }}>
          Choisissez comment l'application s'affiche pour vous. Le mode sombre réduit la fatigue oculaire dans les environnements peu éclairés.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <button
            onClick={() => setTheme('light')}
            style={{
              padding: '20px',
              borderRadius: '16px',
              border: `2px solid ${theme === 'light' ? 'var(--accent)' : 'var(--border)'}`,
              background: theme === 'light' ? 'var(--accent-soft)' : 'var(--panel-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              background: '#fff', 
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b'
            }}>
              <span className="material-symbols-rounded">light_mode</span>
            </div>
            <span style={{ fontWeight: '600', color: theme === 'light' ? 'var(--accent)' : 'var(--ink)' }}>Clair</span>
          </button>

          <button
            onClick={() => setTheme('dark')}
            style={{
              padding: '20px',
              borderRadius: '16px',
              border: `2px solid ${theme === 'dark' ? 'var(--accent)' : 'var(--border)'}`,
              background: theme === 'dark' ? 'var(--accent-soft)' : 'var(--panel-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              background: '#0f172a', 
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f8fafc'
            }}>
              <span className="material-symbols-rounded">dark_mode</span>
            </div>
            <span style={{ fontWeight: '600', color: theme === 'dark' ? 'var(--accent)' : 'var(--ink)' }}>Sombre</span>
          </button>
        </div>
      </div>
    </div>
  );
}
