import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth";

const MIN_PASSWORD_LENGTH = 8;

export function PasswordSettingsPage() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmation) {
      setMessage({ type: "error", text: "Veuillez remplir tous les champs." });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMessage({
        type: "error",
        text: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`
      });
      return;
    }
    if (newPassword !== confirmation) {
      setMessage({
        type: "error",
        text: "La confirmation ne correspond pas au nouveau mot de passe."
      });
      return;
    }
    if (newPassword === currentPassword) {
      setMessage({
        type: "error",
        text: "Le nouveau mot de passe doit être différent du mot de passe actuel."
      });
      return;
    }

    setIsSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setIsSubmitting(false);

    if (!result.success) {
      setMessage({
        type: "error",
        text: result.error ?? "Impossible de modifier le mot de passe."
      });
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setMessage({
      type: "success",
      text: "Votre mot de passe a été modifié avec succès."
    });
  }

  return (
    <div className="page-container settings-detail-page">
      <header className="section-header page-header">
        <div>
          <span className="page-eyebrow">Paramètres</span>
          <h1 className="section-title">Modifier le mot de passe</h1>
          <div className="section-subtitle">
            Sécurisez le compte actuellement connecté.
          </div>
        </div>
        <Link to="/app/parametres" className="button button-secondary">
          <span className="material-symbols-rounded icon">arrow_back</span>
          Retour
        </Link>
      </header>

      {message ? (
        <div
          className={`app-toast app-toast-${message.type} password-settings-toast`}
          role={message.type === "error" ? "alert" : "status"}
        >
          <span className="material-symbols-rounded">
            {message.type === "success" ? "check_circle" : "error"}
          </span>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Fermer">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
      ) : null}

      <section className="card settings-form-card">
        <div className="card-heading">
          <div className="card-heading-icon">
            <span className="material-symbols-rounded">lock_reset</span>
          </div>
          <h2>Sécurité du compte</h2>
        </div>

        <form className="password-settings-form" onSubmit={handleSubmit}>
          <label className="field" htmlFor="current-password">
            <span>Mot de passe actuel</span>
            <input
              id="current-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>

          <label className="field" htmlFor="new-password">
            <span>Nouveau mot de passe</span>
            <input
              id="new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-requirements"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <p id="password-requirements" className="helper-text field-help">
            Utilisez au moins {MIN_PASSWORD_LENGTH} caractères.
          </p>

          <label className="field" htmlFor="confirm-password">
            <span>Confirmer le nouveau mot de passe</span>
            <input
              id="confirm-password"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>

          <div className="form-actions settings-form-actions">
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              <span className="material-symbols-rounded">password</span>
              {isSubmitting ? "Modification…" : "Modifier le mot de passe"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
