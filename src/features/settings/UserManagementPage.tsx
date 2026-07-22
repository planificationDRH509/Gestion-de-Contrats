import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { getDefaultWorkspace } from "../../data/local/workspaces";
import { AppUser } from "../../data/types";

export function UserManagementPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchUsers();
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
        createdAt: u.created_at,
        updatedAt: u.updated_at
      })));
    }
    setLoading(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !fullName) {
      setMessage({ type: 'error', text: "Veuillez remplir tous les champs." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("app_users").insert({
      username,
      full_name: fullName,
      password,
      // Legacy database column retained until the schema can be migrated.
      workspaces: [getDefaultWorkspace().id]
    });

    if (error) {
      setMessage({ type: 'error', text: "Erreur lors de la création: " + error.message });
    } else {
      setMessage({ type: 'success', text: "Utilisateur créé avec succès !" });
      setUsername("");
      setFullName("");
      setPassword("");
      fetchUsers();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="page-container settings-detail-page user-management-page">
      <header className="section-header page-header">
        <div>
          <span className="page-eyebrow">Paramètres</span>
          <h1 className="section-title">Gestion des utilisateurs</h1>
        </div>
      </header>

      <div className="user-management-grid">
        {/* Form Section */}
        <div className="card settings-panel-card">
          <div className="card-heading">
             <div className="card-heading-icon">
               <span className="material-symbols-rounded">person_add</span>
             </div>
             <h2>Nouveau collaborateur</h2>
          </div>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

            {message && (
              <div style={{ 
                padding: '12px', 
                borderRadius: '10px', 
                backgroundColor: message.type === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
                color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
                fontSize: '13.5px',
                fontWeight: '500',
                border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
              }}>
                {message.text}
              </div>
            )}

            <button 
              type="submit" 
              className="button button-primary" 
              disabled={isSubmitting}
              style={{ height: '44px', fontWeight: '600' }}
            >
              {isSubmitting ? "Création..." : "Ajouter l'utilisateur"}
            </button>
          </form>
        </div>

        {/* List Section */}
        <div className="card settings-panel-card">
          <div className="card-heading">
             <div className="card-heading-icon info">
               <span className="material-symbols-rounded">group</span>
             </div>
             <h2>Utilisateurs existants</h2>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <span className="material-symbols-rounded is-spinning" style={{ color: 'var(--primary)' }}>sync</span>
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-muted)' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>person_off</span>
              <p>Aucun utilisateur trouvé.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map(u => (
                <div key={u.id} style={{ 
                  padding: '16px', 
                  borderRadius: '16px', 
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface-sunken)',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '700', color: 'var(--ink)', fontSize: '15px' }}>{u.fullName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-muted)', background: 'var(--panel)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>@{u.username}</div>
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
