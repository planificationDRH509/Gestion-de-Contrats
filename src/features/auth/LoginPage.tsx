import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/app/contrats";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await login(username.trim(), password);
    setLoading(false);
    if (!ok) {
      setError("Identifiants invalides. Veuillez vérifier votre nom d'utilisateur et mot de passe.");
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="material-symbols-rounded icon">workspace_premium</span>
          Ressources Humaines
        </div>
        <h1>Connexion</h1>
        <p className="auth-subtitle">
          Veuillez vous connecter pour accéder à la plateforme.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            <span>Utilisateur</span>
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            <span className="material-symbols-rounded icon">login</span>
            {loading ? "Connexion…" : "Entrer"}
          </button>
        </form>
      </div>
      <div className="auth-side">
        <div className="auth-side-card">
          <div className="auth-side-title">Contrats clairs, prêts à imprimer.</div>
          <div className="auth-side-text">
            Interface desktop first, gestion multi‑contrats et impression optimisée A4.
          </div>
        </div>
      </div>
    </div>
  );
}
