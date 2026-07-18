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
              <span className="app-mark-icon material-symbols-rounded">diversity_3</span>
              <span className="app-mark-copy">
                <strong>Ressources</strong>
                <small>Humaines</small>
              </span>
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
        <div className="user-menu-shell">
          <button 
            className="user-card-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            type="button"
            aria-expanded={menuOpen}
          >
            <div className={`user-card${menuOpen ? " is-open" : ""}`}>
              <span className="user-avatar" aria-hidden="true">
                {user.name.trim().charAt(0).toUpperCase() || "U"}
              </span>
              <div className="user-copy">
                <div className="user-name">{user.name}</div>
                <div className="user-meta">@{user.username}</div>
              </div>
              <span className="material-symbols-rounded user-chevron">
                {menuOpen ? 'expand_less' : 'expand_more'}
              </span>
            </div>
          </button>

          {menuOpen && (
            <div className="user-dropdown-menu">
              <button className="dropdown-item" type="button" onClick={() => { setMenuOpen(false); onLogout(); }}>
                <span className="material-symbols-rounded">sync_alt</span>
                Changer d'utilisateur
              </button>
              <button className="dropdown-item" type="button" onClick={() => { setMenuOpen(false); onLogout(); }}>
                <span className="material-symbols-rounded">lock</span>
                Verrouiller la session
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" type="button" onClick={onLogout}>
                <span className="material-symbols-rounded">logout</span>
                Se déconnecter
              </button>
            </div>
          )}
          
          <div className="sidebar-mode">
            <span className={`sidebar-mode-dot${isOnline ? " is-online" : ""}`} />
            {mode === "supabase" ? "Données synchronisées" : "Données locales"}
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
