import type { Contract } from "../../data/types";
import { formatFirstName, formatLastName } from "../../lib/format";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function buildContractListHtml(contracts: Contract[]) {
  const rows = contracts.map((contract, index) => {
    const name = [formatFirstName(contract.firstName ?? ""), formatLastName(contract.lastName ?? "")].filter(Boolean).join(" ") || contract.nif || contract.id;
    return `<tr><td>${index + 1}</td><td><div class="contract-name"><span class="receipt-checkbox" aria-label="Case à cocher"></span><span>${escapeHtml(name)}</span></div></td><td>${contract.durationMonths == null ? "—" : escapeHtml(`${contract.durationMonths} mois`)}</td><td>${escapeHtml(contract.position || "—")}</td><td>${escapeHtml(contract.assignment || "—")}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Liste des contrats</title><style>
    @page { size: 8.5in 11in; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #171717; background: white; font-family: Arial, sans-serif; font-size: 9pt; }
    h1 { margin: 0 0 7mm; font-size: 17pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { padding: 8px 6px; border-bottom: 1px solid #d4d4d4; text-align: left; vertical-align: top; overflow-wrap: anywhere; line-height: 1.4; }
    th { border-top: 1px solid #171717; border-bottom: 2px solid #171717; font-size: 8pt; }
    .contract-name { display: flex; align-items: flex-start; gap: 7px; }
    .receipt-checkbox { display: inline-block; flex: 0 0 3.5mm; width: 3.5mm; height: 3.5mm; margin-top: 1px; border: 1px solid #171717; background: white; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 22mm; margin-top: 12mm; break-inside: avoid; page-break-inside: avoid; }
    .signature-space { height: 20mm; border-bottom: 1px solid #171717; }
    .signature-label { margin-top: 3mm; text-align: center; font-size: 9pt; }
    .signature-date { display: flex; align-items: baseline; gap: 3mm; margin-top: 8mm; font-size: 9pt; }
    .date-space { flex: 1; height: 5mm; border-bottom: 1px solid #171717; }
  </style></head><body><h1>Liste des contrats</h1><table>
    <colgroup><col style="width:5%"><col style="width:33%"><col style="width:10%"><col style="width:24%"><col style="width:28%"></colgroup>
    <thead><tr><th scope="col">N°</th><th scope="col">Nom et prénom</th><th scope="col">Durée</th><th scope="col">Titre</th><th scope="col">Affectation</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="signatures">
      <div><div class="signature-space"></div><div class="signature-label">Remis par</div><div class="signature-date">Date : <span class="date-space"></span></div></div>
      <div><div class="signature-space"></div><div class="signature-label">Reçu par</div><div class="signature-date">Date : <span class="date-space"></span></div></div>
    </div></body></html>`;
}

// Isolate the summary from the contract print styles and afterprint handlers.
export function printContractList(contracts: Contract[], onComplete: () => void) {
  const frame = document.createElement("iframe");
  frame.title = "Impression de la liste des contrats";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;bottom:0;left:0;width:0;height:0;border:0;";
  const cleanup = () => { frame.remove(); onComplete(); };
  frame.addEventListener("load", () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) { cleanup(); return; }
    printWindow.addEventListener("afterprint", () => setTimeout(cleanup, 0), { once: true });
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  frame.srcdoc = buildContractListHtml(contracts);
  document.body.appendChild(frame);
  return cleanup;
}
