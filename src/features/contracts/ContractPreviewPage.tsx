import { useNavigate } from "react-router-dom";
import { useCreateContract } from "./contractsApi";
import { ContractDocument } from "./ContractDocument";
import { clearDraftContract, loadDraftContract } from "./contractDraft";
import { getStoredFiscalYear } from "../settings/settingsApi";
import { isPastFiscalYear } from "../../lib/contractDateFilters";

export function ContractPreviewPage() {
  const navigate = useNavigate();
  const draft = loadDraftContract();
  const createContract = useCreateContract();
  const fiscalYear = draft?.annee_fiscale || getStoredFiscalYear();
  const fiscalYearIsPast = isPastFiscalYear(fiscalYear);

  async function handleSave(mode: "save" | "print") {
    if (!draft) return;
    const contract = await createContract.mutateAsync({
      workspaceId: draft.workspaceId,
      applicantId: draft.applicantId,
      dossierId: draft.dossierId ?? null,
      status: "saisie",
      gender: draft.gender,
      firstName: draft.firstName,
      lastName: draft.lastName,
      nif: draft.nif,
      ninu: draft.ninu,
      address: draft.address,
      position: draft.position,
      assignment: draft.assignment,
      salaryNumber: draft.salaryNumber,
      salaryText: draft.salaryText,
      durationMonths: draft.durationMonths,
      annee_fiscale: fiscalYear
    });
    clearDraftContract();
    if (mode === "print") {
      navigate(`/app/contrats/print?ids=${contract.id}`);
      return;
    }
    navigate(`/app/contrats/${contract.id}`);
  }

  if (!draft) {
    return (
      <div className="card">
        Aucun aperçu disponible. Retournez au formulaire pour créer un contrat.
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="section-header page-header">
        <div>
          <span className="page-eyebrow">Contrats</span>
          <h1 className="section-title">Vérification du contrat</h1>
          <div className="section-subtitle">Vérifiez les informations avant l'enregistrement final.</div>
          <div className={`contract-fiscal-year-badge ${fiscalYearIsPast ? "is-past" : ""}`}>
            <span className="material-symbols-rounded">calendar_month</span>
            Année fiscale {fiscalYear}
          </div>
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => navigate("/app/contrats/nouveau")}>
            <span className="material-symbols-rounded">arrow_back</span>
            Modifier
          </button>
          <div className="nav-divider" style={{ height: '24px', margin: '0 8px' }} />
          <button
            className="btn btn-primary"
            onClick={() => handleSave("save")}
            disabled={createContract.isPending}
          >
            <span className="material-symbols-rounded">save</span>
            Enregistrer
          </button>
          <button
            className="btn btn-outline"
            onClick={() => handleSave("print")}
            disabled={createContract.isPending}
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <span className="material-symbols-rounded">print</span>
            Imprimer
          </button>
        </div>
      </div>

      {fiscalYearIsPast ? (
        <div className="fiscal-year-contract-warning" role="alert">
          <span className="material-symbols-rounded">warning</span>
          <div>
            <strong>Attention : année fiscale passée ({fiscalYear})</strong>
            <span>Ce contrat sera enregistré dans un exercice déjà terminé.</span>
          </div>
        </div>
      ) : null}

      <div className={`preview-stage ${fiscalYearIsPast ? "fiscal-year-past-outline" : ""}`} data-theme="light">
        <div className="paper-sheet">
          <ContractDocument contract={draft} />
        </div>
      </div>
    </div>
  );
}
