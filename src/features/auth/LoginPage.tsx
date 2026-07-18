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
          <span className="auth-brand-icon material-symbols-rounded">diversity_3</span>
          <span>Ressources Humaines</span>
        </div>
        <div className="auth-heading">
          <span className="auth-eyebrow">Espace sécurisé</span>
          <h1>Heureux de vous revoir</h1>
          <p className="auth-subtitle">
            Connectez-vous pour gérer les contrats et les dossiers de votre équipe.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form" aria-label="Connexion">
          <label className="field">
            <span>Utilisateur</span>
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Votre nom d’utilisateur"
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
              placeholder="Votre mot de passe"
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
          <span className="auth-side-kicker">Pilotage RH</span>
          <div className="auth-side-title">Le travail administratif, enfin plus fluide.</div>
          <div className="auth-side-text">
            Centralisez les contrats, suivez les dossiers et gardez une vision claire de vos effectifs.
          </div>
          <div className="auth-feature-list">
            <span><i className="material-symbols-rounded">check_circle</i> Données centralisées</span>
            <span><i className="material-symbols-rounded">check_circle</i> Impression optimisée</span>
            <span><i className="material-symbols-rounded">check_circle</i> Suivi en temps réel</span>
          </div>
        </div>
      </div>
    </div>
  );
}
