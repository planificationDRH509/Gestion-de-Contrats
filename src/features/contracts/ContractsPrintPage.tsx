import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { useChangeContractsStatus, useContractsByIds } from "./contractsApi";
import { ContractDocument } from "./ContractDocument";
import { appendPrintHistory } from "../../lib/printHistory";

export function ContractsPrintPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const changeContractsStatus = useChangeContractsStatus();
  const lastAfterPrintAtRef = useRef<number | null>(null);

  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
  const { data, isLoading } = useContractsByIds(ids, workspaceId);

  useEffect(() => {
    if (!isLoading && data && data.length > 0) {
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isLoading, data]);

  useEffect(() => {
    if (ids.length === 0 || !workspaceId) return;
    const handleAfterPrint = () => {
      const now = Date.now();
      if (lastAfterPrintAtRef.current && now - lastAfterPrintAtRef.current < 1000) {
        return;
      }
      lastAfterPrintAtRef.current = now;
      changeContractsStatus.mutate({
        workspaceId,
        contractIds: ids,
        status: "imprime"
      });
      if (user && data && data.length > 0) {
        appendPrintHistory(user.id, workspaceId, data);
      }
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [ids, workspaceId, changeContractsStatus, user, data]);

  if (isLoading) {
    return <div className="card">Chargement des contrats…</div>;
  }

  if (!data || data.length === 0) {
    return <div className="card">Aucun contrat à imprimer.</div>;
  }

  const copies = 1;
  const pages = data.flatMap((contract) =>
    Array.from({ length: copies }, (_, index) => ({
      contract,
      key: `${contract.id}-${index}`
    }))
  );

  return (
    <div className="print-stack">
      <div className="section-header no-print">
        <div>
          <div className="section-title">Impression</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            Retour
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>

      {pages.map((item) => (
        <ContractDocument key={item.key} contract={item.contract} />
      ))}
    </div>
  );
}
