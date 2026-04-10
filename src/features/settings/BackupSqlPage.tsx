import { useMemo, useState } from "react";
import { useAuth } from "../auth/auth";

function inferFilename(disposition: string | null): string {
  if (!disposition) {
    return `contribution-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return `contribution-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
}

export function BackupSqlPage() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const operatorName = useMemo(() => user?.name?.trim() || "Administrateur", [user?.name]);

  async function handleExportSqlBackup() {
    setIsExporting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/local/backup/sql", {
        method: "GET",
        headers: {
          "x-operator-name": operatorName
        }
      });

      if (!response.ok) {
        let message = "Impossible de générer le backup SQL.";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          // Fallback message already set.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const filename = inferFilename(response.headers.get("Content-Disposition"));
      const downloadUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);

      setSuccessMessage(`Backup SQL exporté: ${filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur durant l'export SQL.";
      setErrorMessage(message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="content">
      <div className="section-header">
        <div>
          <div className="section-title">Backup SQL</div>
          <p className="helper-text" style={{ marginTop: "8px" }}>
            Téléchargez un export SQL complet de la base locale SQLite pour sauvegarde.
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: "860px", padding: "24px" }}>
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontWeight: 700, color: "var(--ink)" }}>Contenu de l'export</div>
          <div className="helper-text">
            Le fichier inclut la structure SQL et les données des tables locales (`identification`, `contrat`, `dossiers`, etc.).
          </div>
          <div className="helper-text">
            Format: `.sql` compatible SQLite pour restauration ultérieure.
          </div>
        </div>

        <div style={{ marginTop: "20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleExportSqlBackup()}
            disabled={isExporting}
          >
            <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
              download
            </span>
            {isExporting ? "Export en cours..." : "Exporter la base en SQL"}
          </button>

          <span className="badge" style={{ fontSize: "12px" }}>
            Source: SQLite local
          </span>
        </div>

        {successMessage ? (
          <div
            style={{
              marginTop: "16px",
              border: "1px solid #86efac",
              background: "#f0fdf4",
              color: "#166534",
              borderRadius: "12px",
              padding: "10px 12px",
              fontSize: "14px"
            }}
          >
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            style={{
              marginTop: "16px",
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: "12px",
              padding: "10px 12px",
              fontSize: "14px"
            }}
          >
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
