import { useState } from "react";
import { Info, RotateCcw, X } from "lucide-react";
import type { Contract } from "../../data/types";
import { formatCurrency, formatFirstName, formatLastName } from "../../lib/format";

export function PrintContractIndexItem({ contract, index, active, excluded, onToggle }: {
  contract: Contract;
  index: number;
  active: boolean;
  excluded: boolean;
  onToggle: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const name = [formatFirstName(contract.firstName ?? ""), formatLastName(contract.lastName ?? "")].filter(Boolean).join(" ") || contract.nif || contract.id;
  const detailsId = `print-details-${contract.id}`;
  const toggleLabel = excluded ? `Réintégrer ${name}` : `Retirer ${name} de l’impression`;

  return (
    <li
      className={`print-contract-item${excluded ? " is-excluded" : ""}${detailsOpen ? " details-open" : ""}`}
      onKeyDown={event => {
        if (event.key === "Escape" && detailsOpen) {
          event.stopPropagation();
          setDetailsOpen(false);
        }
      }}
    >
      <div className="print-contract-row">
        <a
          href={`#${encodeURIComponent(`print-contract-${contract.id}`)}`}
          aria-current={active && !excluded ? "location" : undefined}
          aria-disabled={excluded || undefined}
          tabIndex={excluded ? -1 : undefined}
          onClick={event => {
            event.preventDefault();
            if (excluded) return;
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
          <span className="print-contract-index-name">{name}</span>
        </a>
        <div className="print-contract-actions">
          <button
            type="button"
            className="print-contract-action"
            aria-label={`Détails de ${name}`}
            title="Détails du contrat"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen(open => !open)}
          >
            <Info size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`print-contract-action ${excluded ? "is-restore" : "is-remove"}`}
            aria-label={toggleLabel}
            title={excluded ? "Réintégrer à l’impression" : "Retirer de l’impression"}
            onClick={onToggle}
          >
            {excluded ? <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" /> : <X size={15} strokeWidth={1.8} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {detailsOpen && (
        <div id={detailsId} className="print-contract-details" role="region" aria-label={`Détails de ${name}`}>
          <dl>
            <div>
              <dt>Durée</dt>
              <dd>{contract.durationMonths == null ? "—" : `${contract.durationMonths} mois`}</dd>
            </div>
            <div>
              <dt>Salaire <span>(HTG)</span></dt>
              <dd>{contract.salaryNumber == null ? "—" : formatCurrency(contract.salaryNumber)}</dd>
            </div>
            <div className="print-contract-detail-wide">
              <dt>Titre</dt>
              <dd>{contract.position || "—"}</dd>
            </div>
            <div className="print-contract-detail-wide">
              <dt>Affectation</dt>
              <dd>{contract.assignment || "—"}</dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  );
}
