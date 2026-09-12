import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { useChangeContractsStatus, useContractsByIds } from "./contractsApi";
import {
  ContractDocument,
  type ContractPageSelection
} from "./ContractDocument";
import { appendPrintHistory } from "../../lib/printHistory";
import { orderContractsByIds } from "../../lib/contractSorting";

export function ContractsPrintPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const changeContractsStatus = useChangeContractsStatus();
  const lastAfterPrintAtRef = useRef<number | null>(null);
  const lastAutoPrintedSelectionRef = useRef<string | null>(null);
  const [pageSelection, setPageSelection] = useState<ContractPageSelection>("all");

  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
  const printSelectionKey = `${workspaceId}:${ids.join(",")}`;
  const { data, isLoading } = useContractsByIds(ids, workspaceId);

  useEffect(() => {
    if (
      !isLoading &&
      data &&
      data.length > 0 &&
      ids.length === 1 &&
      lastAutoPrintedSelectionRef.current !== printSelectionKey
    ) {
      const timer = setTimeout(() => {
        if (lastAutoPrintedSelectionRef.current === printSelectionKey) return;
        lastAutoPrintedSelectionRef.current = printSelectionKey;
        window.print();
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isLoading, data, ids.length, printSelectionKey]);

  function handlePrint() {
    lastAutoPrintedSelectionRef.current = printSelectionKey;
    window.print();
  }

  useEffect(() => {
    if (ids.length === 0 || !workspaceId) return;
    const handleAfterPrint = () => {
      const now = Date.now();
      if (lastAfterPrintAtRef.current && now - lastAfterPrintAtRef.current < 1000) {
        return;
      }
      lastAfterPrintAtRef.current = now;
      const isPartialPrint = pageSelection !== "all";
      const nextStatus = isPartialPrint ? "impression_partiel" : "imprime";
      const nextStatusLabel = isPartialPrint ? "Impression partielle" : "Imprimé";
      if (can("contracts.change_status")) {
        const shouldMarkAsPrinted = window.confirm(
          ids.length === 1
            ? `Voulez-vous changer l’état de ce contrat en « ${nextStatusLabel} » ?`
            : `Voulez-vous changer l’état de ces ${ids.length} contrats en « ${nextStatusLabel} » ?`
        );
        if (shouldMarkAsPrinted) {
          changeContractsStatus.mutate({
            workspaceId,
            contractIds: ids,
            status: nextStatus
          });
        }
      }
      if (user && data && data.length > 0) {
        appendPrintHistory(user.id, workspaceId, orderContractsByIds(data, ids), {
          partial: isPartialPrint
        });
      }
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [ids, workspaceId, changeContractsStatus, user, data, can, pageSelection]);

  if (isLoading) {
    return <div className="card">Chargement des contrats…</div>;
  }

  if (!data || data.length === 0) {
    return <div className="card">Aucun contrat à imprimer.</div>;
  }

  const orderedContracts = orderContractsByIds(data, ids);

  const copies = 1;
  const pages = orderedContracts.flatMap((contract) =>
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
          {ids.length > 1 ? (
            <div className="print-page-selection" role="radiogroup" aria-label="Pages à imprimer">
              <span className="print-page-selection-label">Pages de chaque contrat :</span>
              <label className={pageSelection === "all" ? "is-active" : ""}>
                <input
                  type="radio"
                  name="contract-pages"
                  value="all"
                  checked={pageSelection === "all"}
                  onChange={() => setPageSelection("all")}
                />
                Les 4 pages
              </label>
              <label className={pageSelection === "first" ? "is-active" : ""}>
                <input
                  type="radio"
                  name="contract-pages"
                  value="first"
                  checked={pageSelection === "first"}
                  onChange={() => setPageSelection("first")}
                />
                Page 1 seulement
              </label>
              <label className={pageSelection === "fourth" ? "is-active" : ""}>
                <input
                  type="radio"
                  name="contract-pages"
                  value="fourth"
                  checked={pageSelection === "fourth"}
                  onChange={() => setPageSelection("fourth")}
                />
                Page 4 seulement
              </label>
            </div>
          ) : null}
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            Retour
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>
            Imprimer
          </button>
        </div>
      </div>

      {pages.map((item) => (
        <ContractDocument
          key={item.key}
          contract={item.contract}
          pageSelection={pageSelection}
        />
      ))}
    </div>
  );
}
