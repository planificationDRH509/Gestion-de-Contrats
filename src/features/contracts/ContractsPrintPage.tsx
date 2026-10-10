import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { useChangeContractsStatus, useContractsByIds } from "./contractsApi";
import {
  ContractDocuments,
  CONTRACT_PAGES,
  type ContractPageSelection
} from "./ContractDocument";
import { appendPrintHistory } from "../../lib/printHistory";
import { orderContractsByIds } from "../../lib/contractSorting";
import { formatFirstName, formatLastName } from "../../lib/format";

export function ContractsPrintPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const changeContractsStatus = useChangeContractsStatus();
  const lastAfterPrintAtRef = useRef<number | null>(null);
  const [pageSelection, setPageSelection] = useState<ContractPageSelection>(CONTRACT_PAGES);

  const idsParam = searchParams.get("ids") ?? "";
  const ids = useMemo(() => idsParam.split(",").map((id) => id.trim()).filter(Boolean), [idsParam]);
  const { data, isLoading } = useContractsByIds(ids, workspaceId);

  const orderedContracts = useMemo(() => orderContractsByIds(data ?? [], ids), [data, ids]);

  function handlePrint() {
    if (pageSelection.length > 0) window.print();
  }

  useEffect(() => {
    if (ids.length === 0 || !workspaceId) return;
    const handleAfterPrint = () => {
      const now = Date.now();
      if (lastAfterPrintAtRef.current && now - lastAfterPrintAtRef.current < 1000) {
        return;
      }
      lastAfterPrintAtRef.current = now;
      const isPartialPrint = pageSelection.length !== CONTRACT_PAGES.length;
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

  return (
    <div className="print-stack">
      <div className="section-header no-print">
        <div>
          <div className="section-title">Impression</div>
          <div className="print-page-selection" role="group" aria-label="Pages à imprimer">
            {CONTRACT_PAGES.map(page => (
              <button
                key={page}
                type="button"
                className={`print-page-toggle${pageSelection.includes(page) ? " is-active" : ""}`}
                aria-label={`Page ${page}`}
                aria-pressed={pageSelection.includes(page)}
                title={`Page ${page}`}
                onClick={() => setPageSelection(selected => selected.includes(page)
                  ? selected.filter(value => value !== page)
                  : CONTRACT_PAGES.filter(value => value === page || selected.includes(value)))}
              >
                <svg width="32" height="40" viewBox="0 0 32 40" fill="none" aria-hidden="true">
                  <path d="M5 2h14l8 8v28H5V2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M19 2v8h8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <text x="16" y="29" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="600">{page}</text>
                </svg>
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            Retour
          </button>
          <button className="btn btn-primary" onClick={handlePrint} disabled={pageSelection.length === 0}>
            Imprimer
          </button>
        </div>
      </div>

      <div className="print-preview-layout">
        <nav className="print-contract-index no-print" aria-label="Contrats sélectionnés">
          <ol>
            {orderedContracts.map((contract, index) => (
              <li key={contract.id}>
                <a
                  href={`#${encodeURIComponent(`print-contract-${contract.id}`)}`}
                  onClick={event => {
                    event.preventDefault();
                    const target = document.getElementById(`print-contract-${contract.id}`);
                    target?.scrollIntoView({
                      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
                      block: "start",
                      inline: "nearest"
                    });
                    target?.focus({ preventScroll: true });
                  }}
                >
                  <span className="print-contract-index-number" aria-hidden="true">{index + 1}</span>
                  <span>{[formatFirstName(contract.firstName ?? ""), formatLastName(contract.lastName ?? "")].filter(Boolean).join(" ") || contract.nif || contract.id}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="print-preview-documents">
          <ContractDocuments
            contracts={orderedContracts}
            workspaceId={workspaceId}
            pageSelection={pageSelection}
          />
        </div>
      </div>
    </div>
  );
}
