import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth, AuthUser } from "../../features/auth/auth";
import { listLocalWorkspaces } from "../../data/local/workspaces";
import { syncSuggestionsFromServer } from "../../data/local/suggestionsDb";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onResizeStart?: () => void;
  isResizing?: boolean;
  isOnline?: boolean;
}

export function Sidebar({ collapsed, onToggle, onResizeStart, isResizing, isOnline = true }: SidebarProps) {
  const { user, logout, switchWorkspace } = useAuth();
  const workspaces = listLocalWorkspaces().filter(w => user?.allowedWorkspaces?.includes(w.id));
  const mode = (import.meta.env.VITE_DATA_PROVIDER ?? "local").toLowerCase();

  useEffect(() => {
    if (user?.workspaceId) {
      syncSuggestionsFromServer(user.workspaceId);
    }
  }, [user?.workspaceId]);

  if (!user) return null;

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}${isResizing ? " is-resizing" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-top">
          <button
            className="sidebar-toggle-hamburger"
            onClick={onToggle}
            title={collapsed ? "Afficher le menu" : "Réduire le menu"}
            type="button"
          >
            <span className="material-symbols-rounded">
              {collapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}
            </span>
          </button>
          
          {!collapsed && (
            <div className="app-mark">
              <span>RESSOURCES</span>
              <span>HUMAINES</span>
            </div>
          )}
        </div>

        {!collapsed && (
          <WorkspaceSwitcher 
            user={user} 
            workspaces={workspaces} 
            onSwitch={switchWorkspace} 
          />
        )}
      </div>

      <nav className="sidebar-nav">
        <NavItem 
          to="/app/contrats" 
          icon="description" 
          label="Contrats" 
          collapsed={collapsed} 
          end 
        />
        <NavItem 
          to="/app/contrats/nouveau" 
          icon="add_circle" 
          label="Nouveau contrat" 
          collapsed={collapsed} 
        />
        <NavItem 
          to="/app/statistiques" 
          icon="analytics" 
          label="Statistiques" 
          collapsed={collapsed} 
        />
        <NavItem 
          to="/app/identification" 
          icon="badge" 
          label="Identification" 
          collapsed={collapsed} 
        />

        <div className="nav-divider" />
        
        <NavItem 
          to="/app/parametres" 
          icon="settings" 
          label="Paramètres" 
          collapsed={collapsed} 
        />
      </nav>

      <SidebarFooter 
        user={user} 
        collapsed={collapsed} 
        mode={mode} 
        isOnline={isOnline}
        onLogout={logout} 
      />

      <div 
        className="sidebar-resizer" 
        onMouseDown={onResizeStart}
      />
    </aside>
  );
}

function NavItem({ to, icon, label, collapsed, end }: { to: string, icon: string, label: string, collapsed: boolean, end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
      title={collapsed ? label : undefined}
    >
      <span className="material-symbols-rounded nav-icon">{icon}</span>
      <span className="sidebar-label">{label}</span>
    </NavLink>
  );
}

function WorkspaceSwitcher({ user, workspaces, onSwitch }: { user: AuthUser, workspaces: any[], onSwitch: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="workspace-container">
      <button 
        className="workspace-chip" 
        onClick={() => setOpen(!open)}
        title="Changer de workspace"
      >
        Workspace · {workspaces.find(w => w.id === user.workspaceId)?.name || user.workspaceName}
        <span className="material-symbols-rounded">expand_more</span>
      </button>
      
      {open && (
        <div className="workspace-dropdown">
          {workspaces.map((w) => (
            <button
              key={w.id}
              className={`workspace-item ${w.id === user.workspaceId ? "active" : ""}`}
              onClick={() => {
                onSwitch(w.id, w.name);
                setOpen(false);
              }}
            >
              {w.name}
              {w.id === user.workspaceId && (
                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarFooter({ user, collapsed, mode, isOnline, onLogout }: { user: AuthUser, collapsed: boolean, mode: string, isOnline: boolean, onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="sidebar-footer">
      {!isOnline && !collapsed && (
        <div className="offline-notice">
          <span className="material-symbols-rounded">cloud_off</span>
          Hors ligne (Cache actif)
        </div>
      )}
      
      {!collapsed ? (
        <div style={{ position: 'relative', width: '100%' }}>
          <button 
            className="user-card-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ 
              width: '100%', 
              textAlign: 'left', 
              background: 'none', 
              border: 'none', 
              padding: '0', 
              cursor: 'pointer',
              borderRadius: '12px',
              transition: 'background 0.2s'
            }}
          >
            <div className="user-card" style={{ 
              margin: '0', 
              padding: '12px',
              backgroundColor: menuOpen ? 'var(--accent-soft)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div className="user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                <div className="user-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</div>
              </div>
              <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--ink-muted)' }}>
                {menuOpen ? 'expand_less' : 'expand_more'}
              </span>
            </div>
          </button>

          {menuOpen && (
            <div className="user-dropdown-menu" style={{
              position: 'absolute',
              bottom: '100%',
              left: '0',
              width: '100%',
              backgroundColor: 'var(--surface)',
              borderRadius: '12px',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
              border: '1px solid var(--border)',
              padding: '8px',
              marginBottom: '8px',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <button className="dropdown-item" onClick={() => { setMenuOpen(false); onLogout(); }} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                width: '100%',
                fontSize: '14px',
                color: 'var(--ink)'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>sync_alt</span>
                Changer d'utilisateur
              </button>
              <button className="dropdown-item" onClick={() => { setMenuOpen(false); onLogout(); }} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                width: '100%',
                fontSize: '14px',
                color: 'var(--ink)'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>lock</span>
                Verrouiller la session
              </button>
              <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
              <button className="dropdown-item" onClick={onLogout} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                width: '100%',
                fontSize: '14px',
                color: '#d93025'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>logout</span>
                Se déconnecter
              </button>
            </div>
          )}
          
          <div className="status-pill" style={{ marginTop: '8px', marginBottom: '8px', fontSize: '11px', padding: '4px 10px' }}>
            Mode: {mode === "supabase" ? "Supabase" : "Local"}
          </div>
        </div>
      ) : (
        <button
          className="icon-btn"
          onClick={onLogout}
          type="button"
          title="Se déconnecter"
          style={{ width: '100%' }}
        >
          <span className="material-symbols-rounded icon">logout</span>
        </button>
      )}
    </div>
  );
}
