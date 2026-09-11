import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./auth";

export function SessionLockScreen() {
  const { user, unlock, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Entrez votre mot de passe.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await unlock(password);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Impossible de déverrouiller la session.");
      setPassword("");
    }
  }

  return (
    <div className="session-lock-screen" role="dialog" aria-modal="true" aria-labelledby="session-lock-title">
      <div className="session-lock-card">
        <div className="session-lock-icon" aria-hidden="true">
          <span className="material-symbols-rounded">lock</span>
        </div>
        <span className="page-eyebrow">Session verrouillée</span>
        <h1 id="session-lock-title">Bon retour, {user?.name ?? "utilisateur"}</h1>
        <p>Votre session a été verrouillée après 15 minutes d’inactivité.</p>

        <form onSubmit={handleSubmit} className="session-lock-form">
          <label className="field" htmlFor="session-unlock-password">
            <span>Mot de passe</span>
            <input
              ref={passwordRef}
              id="session-unlock-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button className="button button-primary" type="submit" disabled={isSubmitting}>
            <span className="material-symbols-rounded">lock_open</span>
            {isSubmitting ? "Vérification…" : "Déverrouiller"}
          </button>
        </form>

        <button className="session-lock-logout" type="button" onClick={logout}>
          Se connecter avec un autre compte
        </button>
      </div>
    </div>
  );
}
