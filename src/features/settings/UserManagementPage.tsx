import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { getDefaultWorkspace } from "../../data/local/workspaces";
import type { AppUser } from "../../data/types";
import { fetchAppUsers, isMissingRoleColumn } from "../auth/usersApi";
import { useAuth } from "../auth/auth";
import {
  APP_ROLES,
  APP_ROLE_LABELS,
  type AppRole
} from "../auth/permissions";

export function UserManagementPage() {
  const { user, can } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleColumnAvailable, setRoleColumnAvailable] = useState(true);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("agent");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const result = await fetchAppUsers();
      setUsers(result.users);
      setRoleColumnAvailable(result.hasRoleColumn);
      if (!result.hasRoleColumn) {
        setMessage({
          type: "error",
          text: "La gestion des rôles est inactive : appliquez supabase/migrations/013_app_user_roles.sql."
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: `Impossible de charger les utilisateurs : ${error instanceof Error ? error.message : "Erreur Supabase"}`
      });
    }
    setLoading(false);
  }

  const adminCount = useMemo(
    () => users.filter((item) => item.role === "admin").length,
    [users]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!can("users.manage")) {
      setMessage({
        type: "error",
        text: "Seul un administrateur peut créer un compte."
      });
      return;
    }
    if (!username.trim() || !password || !fullName.trim()) {
      setMessage({ type: "error", text: "Veuillez remplir tous les champs." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    const supabase = getSupabaseClient();
    const payload = {
      username: username.trim(),
      full_name: fullName.trim(),
      password,
      workspaces: [getDefaultWorkspace().id]
    };
    let roleColumnMissing = false;
    let { error } = await supabase.from("app_users").insert(
      roleColumnAvailable ? { ...payload, role } : payload
    );

    // Allow account creation before the role migration, while making it clear
    // that the selected role cannot be stored until the migration is applied.
    if (error && isMissingRoleColumn(error)) {
      roleColumnMissing = true;
      ({ error } = await supabase.from("app_users").insert(payload));
      setRoleColumnAvailable(false);
    }

    if (error) {
      setMessage({
        type: "error",
        text: `Erreur lors de la création : ${error.message}`
      });
    } else {
      setUsername("");
      setFullName("");
      setPassword("");
      setRole("agent");
      setMessage({
        type: roleColumnMissing ? "error" : "success",
        text: roleColumnMissing
          ? "Compte créé comme agent, mais le rôle n’est pas synchronisé. Appliquez supabase/migrations/013_app_user_roles.sql."
          : "Utilisateur créé avec succès."
      });
      await fetchUsers();
    }
    setIsSubmitting(false);
  }

  async function updateRole(target: AppUser, nextRole: AppRole) {
    if (!can("users.manage")) return;
    if (!roleColumnAvailable) {
      setMessage({
        type: "error",
        text: "Impossible de modifier les rôles tant que supabase/migrations/013_app_user_roles.sql n’est pas appliquée."
      });
      return;
    }
    if (target.id === user?.id) {
      setMessage({
        type: "error",
        text: "Vous ne pouvez pas modifier votre propre rôle pendant votre session."
      });
      return;
    }
    if (target.role === "admin" && nextRole !== "admin" && adminCount <= 1) {
      setMessage({
        type: "error",
        text: "Au moins un compte administrateur doit être conservé."
      });
      return;
    }

    setUpdatingUserId(target.id);
    setMessage(null);
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("app_users")
      .update({ role: nextRole })
      .eq("id", target.id);

    if (error) {
      setMessage({
        type: "error",
        text: isMissingRoleColumn(error)
          ? "La colonne role manque dans Supabase. Appliquez supabase/migrations/013_app_user_roles.sql."
          : `Impossible de modifier le rôle : ${error.message}`
      });
      if (isMissingRoleColumn(error)) setRoleColumnAvailable(false);
    } else {
      setUsers((current) => current.map((item) =>
        item.id === target.id ? { ...item, role: nextRole } : item
      ));
      setMessage({
        type: "success",
        text: `Rôle de ${target.fullName} mis à jour.`
      });
    }
    setUpdatingUserId(null);
  }

  return (
    <div className="page-container settings-detail-page user-management-page">
      <header className="section-header page-header">
        <div>
          <span className="page-eyebrow">Administration</span>
          <h1 className="section-title">Utilisateurs et permissions</h1>
          <div className="section-subtitle">
            Chaque compte possède un rôle qui détermine ses accès.
          </div>
        </div>
      </header>

      {message ? (
        <div className={`app-toast app-toast-${message.type}`} role="status">
          <span className="material-symbols-rounded">
            {message.type === "success" ? "check_circle" : "error"}
          </span>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Fermer">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
      ) : null}

      {!roleColumnAvailable ? (
        <div className="app-toast app-toast-error" role="status">
          Les comptes restent visibles, mais les rôles ne peuvent pas être synchronisés tant que la migration
          <code>013_app_user_roles.sql</code> n’est pas exécutée dans Supabase.
        </div>
      ) : null}

      <div className="user-management-grid">
        <section className="card settings-panel-card">
          <div className="card-heading">
            <div className="card-heading-icon">
              <span className="material-symbols-rounded">person_add</span>
            </div>
            <h2>Nouveau collaborateur</h2>
          </div>

          <form onSubmit={handleSubmit} className="user-create-form">
            <label className="field">
              <span>Nom complet</span>
              <input
                className="input"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Ex. Jean Dupont"
              />
            </label>
            <label className="field">
              <span>Nom d’utilisateur</span>
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Ex. jdupont"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Mot de passe</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>Rôle</span>
              <select
                className="select"
                value={role}
                disabled={!roleColumnAvailable}
                onChange={(event) => setRole(event.target.value as AppRole)}
              >
                {APP_ROLES.map((item) => (
                  <option key={item} value={item}>{APP_ROLE_LABELS[item]}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              <span className="material-symbols-rounded">person_add</span>
              {isSubmitting ? "Création…" : "Créer le compte"}
            </button>
          </form>
        </section>

        <section className="card settings-panel-card">
          <div className="card-heading">
            <div className="card-heading-icon info">
              <span className="material-symbols-rounded">manage_accounts</span>
            </div>
            <h2>Comptes existants</h2>
          </div>

          {loading ? (
            <div className="user-list-empty">Chargement…</div>
          ) : users.length === 0 ? (
            <div className="user-list-empty">Aucun utilisateur trouvé.</div>
          ) : (
            <div className="user-role-list">
              {users.map((item) => (
                <article className="user-role-row" key={item.id}>
                  <div className="user-role-avatar">
                    {item.fullName.trim().charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="user-role-copy">
                    <strong>{item.fullName}</strong>
                    <span>@{item.username}{item.id === user?.id ? " · Vous" : ""}</span>
                  </div>
                  <select
                    className="select"
                    value={item.role}
                    disabled={!roleColumnAvailable || updatingUserId === item.id || item.id === user?.id}
                    onChange={(event) =>
                      void updateRole(item, event.target.value as AppRole)
                    }
                    aria-label={`Rôle de ${item.fullName}`}
                  >
                    {APP_ROLES.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>
                        {APP_ROLE_LABELS[roleOption]}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card permission-matrix">
        <div className="card-heading">
          <div className="card-heading-icon">
            <span className="material-symbols-rounded">admin_panel_settings</span>
          </div>
          <h2>Résumé des permissions</h2>
        </div>
        <div className="permission-grid">
          <div><strong>Administrateur</strong><span>Accès complet, paramètres et comptes.</span></div>
          <div><strong>Agent de saisie</strong><span>Création, modification, dossiers, imports et identifications.</span></div>
          <div><strong>Contrôleur</strong><span>Correction, statuts, audit et contrôle qualité.</span></div>
          <div><strong>Lecture seule</strong><span>Consultation, statistiques et impression.</span></div>
        </div>
      </section>
    </div>
  );
}
