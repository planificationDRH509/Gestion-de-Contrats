import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { listLocalWorkspaces } from "../../data/local/workspaces";
import { AppUser, Workspace } from "../../data/types";

export function UserManagementPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  
  // Form state
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchUsers();
    setWorkspaces(listLocalWorkspaces());
  }, []);

  async function fetchUsers() {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      // Map database names to camelCase if necessary, but here we'll just handle it or use types.
      setUsers(data.map(u => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        workspaces: u.workspaces || [],
        createdAt: u.created_at,
        updatedAt: u.updated_at
      })));
    }
    setLoading(false);
  }

  const toggleWorkspace = (id: string) => {
    setSelectedWorkspaces(prev => 
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !fullName || selectedWorkspaces.length === 0) {
      setMessage({ type: 'error', text: "Veuillez remplir tous les champs et sélectionner au moins un espace de travail." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("app_users").insert({
      username,
      full_name: fullName,
      password,
      workspaces: selectedWorkspaces
    });

    if (error) {
      setMessage({ type: 'error', text: "Erreur lors de la création: " + error.message });
    } else {
      setMessage({ type: 'success', text: "Utilisateur créé avec succès !" });
      setUsername("");
      setFullName("");
      setPassword("");
      setSelectedWorkspaces([]);
      fetchUsers();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="content">
      <div className="section-header">
        <h1 className="section-title">Gestion des Utilisateurs</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '24px' }}>
        {/* Form Section */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--ink)' }}>Créer un Nouvel Utilisateur</h2>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="label">Nom complet</label>
              <input 
                type="text" 
                className="input" 
                value={fullName} 
                onChange={e => setFullName(e.target.value)} 
                placeholder="Ex: Jean Dupont"
              />
            </div>

            <div className="form-group">
              <label className="label">Nom d'utilisateur</label>
              <input 
                type="text" 
                className="input" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                placeholder="Ex: jdupont"
              />
            </div>

            <div className="form-group">
              <label className="label">Mot de passe</label>
              <input 
                type="password" 
                className="input" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="••••••••"
              />
            </div>

            <div className="form-group">
              <label className="label">Espaces de travail autorisés</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {workspaces.map(wp => (
                  <label key={wp.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedWorkspaces.includes(wp.id)} 
                      onChange={() => toggleWorkspace(wp.id)}
                    />
                    {wp.name}
                  </label>
                ))}
              </div>
            </div>

            {message && (
              <div style={{ 
                padding: '12px', 
                borderRadius: '8px', 
                backgroundColor: message.type === 'success' ? '#e6f4ea' : '#fce8e6',
                color: message.type === 'success' ? '#1e8e3e' : '#d93025',
                fontSize: '14px'
              }}>
                {message.text}
              </div>
            )}

            <button 
              type="submit" 
              className="button button-primary" 
              disabled={isSubmitting}
              style={{ marginTop: '12px' }}
            >
              {isSubmitting ? "Création..." : "Ajouter l'utilisateur"}
            </button>
          </form>
        </div>

        {/* List Section */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--ink)' }}>Utilisateurs Existants</h2>
          {loading ? (
            <p style={{ color: 'var(--ink-muted)' }}>Chargement...</p>
          ) : users.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)' }}>Aucun utilisateur trouvé.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map(u => (
                <div key={u.id} style={{ 
                  padding: '16px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '600', color: 'var(--ink)' }}>{u.fullName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>@{u.username}</div>
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {u.workspaces.map(wpId => {
                      const wp = workspaces.find(w => w.id === wpId);
                      return (
                        <span key={wpId} style={{ 
                          fontSize: '11px', 
                          padding: '2px 8px', 
                          borderRadius: '10px', 
                          backgroundColor: 'var(--accent-soft)', 
                          color: 'var(--accent)' 
                        }}>
                          {wp?.name || wpId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
