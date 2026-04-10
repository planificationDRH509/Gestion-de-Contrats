import { useNavigate } from "react-router-dom";
import { useCreateContract } from "./contractsApi";
import { ContractDocument } from "./ContractDocument";
import { clearDraftContract, loadDraftContract } from "./contractDraft";

export function ContractPreviewPage() {
  const navigate = useNavigate();
  const draft = loadDraftContract();
  const createContract = useCreateContract();

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
      durationMonths: draft.durationMonths
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
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">Aperçu (non enregistré)</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => navigate("/app/contrats/nouveau")}> 
            Retour
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleSave("save")}
            disabled={createContract.isPending}
          >
            Enregistrer
          </button>
          <button
            className="btn btn-outline"
            onClick={() => handleSave("print")}
            disabled={createContract.isPending}
          >
            Imprimer
          </button>
        </div>
      </div>

      <ContractDocument contract={draft} />
    </div>
  );
}
