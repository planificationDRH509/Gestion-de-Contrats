import { useEffect, useMemo, useRef, useState } from "react";
import { useMinisters } from "../settings/ministersApi";
import { findContractMinister } from "../../lib/ministers";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { printContractList } from "./printContractList";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { useChangeContractsStatus, useContractsByIds } from "./contractsApi";
import {
  ContractDocuments,
  CONTRACT_PAGES,
  type ContractPageSelection
} from "./ContractDocument";
import { appendPrintHistory } from "../../lib/printHistory";
import { sortContracts } from "../../lib/contractSorting";
import { PrintAddContractsDialog } from "./PrintAddContractsDialog";
import { PrintContractIndexItem } from "./PrintContractIndexItem";

export function ContractsPrintPage() {
  const { registry: ministers } = useMinisters();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const changeContractsStatus = useChangeContractsStatus();
  const lastAfterPrintAtRef = useRef<number | null>(null);
  const listPrintInProgressRef = useRef(false);
  const listPrintCleanupRef = useRef<(() => void) | null>(null);
  const [addingContracts, setAddingContracts] = useState(false);
  const addedBatchRef = useRef<string | null>(null);
  const [indexVisible, setIndexVisible] = useState(true);
  const documentsRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLElement>(null);
  const [pageSelection, setPageSelection] = useState<ContractPageSelection>(CONTRACT_PAGES);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [activeContractId, setActiveContractId] = useState<string | null>(null);

  const idsParam = searchParams.get("ids") ?? "";
  const ids = useMemo(() => idsParam.split(",").map((id) => id.trim()).filter(Boolean), [idsParam]);
  const { data, isLoading } = useContractsByIds(ids, workspaceId);

  const orderedContracts = useMemo(() => sortContracts(data ?? [], "name_asc"), [data]);

  const printableContracts = useMemo(() => orderedContracts.filter(contract => !excludedIds.has(contract.id)), [orderedContracts, excludedIds]);
  const ministersReady = printableContracts.every(contract => findContractMinister(contract, ministers));

  useEffect(() => {
    if (addedBatchRef.current !== `${workspaceId}:${idsParam}`) setExcludedIds(new Set());
    addedBatchRef.current = null;
  }, [idsParam, workspaceId]);

  function addContracts(addedIds: string[]) {
    const nextIds = [...new Set([...ids, ...addedIds])].join(",");
    addedBatchRef.current = `${workspaceId}:${nextIds}`;
    setExcludedIds(previous => new Set([...previous].filter(id => !addedIds.includes(id))));
    const params = new URLSearchParams(searchParams);
    params.set("ids", nextIds);
    setSearchParams(params, { replace: true });
    setAddingContracts(false);
    setIndexVisible(true);
  }

  useEffect(() => () => listPrintCleanupRef.current?.(), []);

  useEffect(() => {
    const preview = documentsRef.current;
    if (!preview || typeof ResizeObserver === "undefined") return;
    const resize = () => {
      // Letter pages remain full size for printing; only the screen preview shrinks.
      const scale = Math.min(1, Math.max(1, preview.clientWidth - 8) / 816);
      preview.style.setProperty("--print-preview-scale", String(scale));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(preview);
    resize();
    return () => observer.disconnect();
  }, [isLoading, data?.length]);

  function handlePrintList() {
    if (printableContracts.length === 0) return;
    listPrintCleanupRef.current?.();
    listPrintInProgressRef.current = true;
    listPrintCleanupRef.current = printContractList(printableContracts, () => { listPrintInProgressRef.current = false; });
  }

  function toggleContract(id: string) {
    setExcludedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    const root = documentsRef.current;
    if (!root || pageSelection.length === 0) {
      setActiveContractId(null);
      return;
    }
    const documents = printableContracts.flatMap(contract => {
      const element = document.getElementById(`print-contract-${contract.id}`);
      return element ? [{ id: contract.id, element }] : [];
    });
    let frame: number | null = null;
    const updateActiveContract = () => {
      frame = null;
      // Follow the contract occupying the middle of the visible preview. Binary
      // search keeps scroll work small even when the batch has hundreds of pages.
      const readingLine = root.getBoundingClientRect().top + root.clientHeight / 2;
      let left = 0;
      let right = documents.length - 1;
      let active = 0;
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        if (documents[middle].element.getBoundingClientRect().top <= readingLine) {
          active = middle;
          left = middle + 1;
        } else {
          right = middle - 1;
        }
      }
      setActiveContractId(documents[active]?.id ?? null);
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = requestAnimationFrame(updateActiveContract);
    };
    root.addEventListener("scroll", scheduleUpdate, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(root);
    documents.forEach(({ element }) => observer?.observe(element));
    scheduleUpdate();
    return () => {
      root.removeEventListener("scroll", scheduleUpdate);
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [printableContracts, isLoading, pageSelection, ministersReady]);

  useEffect(() => {
    const index = indexRef.current;
    const activeLink = index?.querySelector('[aria-current="location"]');
    if (!index || !activeLink || !indexVisible) return;
    const listBounds = index.getBoundingClientRect();
    const linkBounds = activeLink.getBoundingClientRect();
    if (linkBounds.top < listBounds.top) {
      index.scrollTop += linkBounds.top - listBounds.top - 6;
    } else if (linkBounds.bottom > listBounds.bottom) {
      index.scrollTop += linkBounds.bottom - listBounds.bottom + 6;
    }
  }, [activeContractId, indexVisible]);

  function handlePrint() {
    listPrintInProgressRef.current = false;
    if (ministersReady && pageSelection.length > 0 && printableContracts.length > 0) window.print();
  }

  useEffect(() => {
    if (!ministersReady || printableContracts.length === 0 || pageSelection.length === 0 || !workspaceId) return;
    const handleAfterPrint = () => {
      if (listPrintInProgressRef.current) return;
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
          printableContracts.length === 1
            ? `Voulez-vous changer l’état de ce contrat en « ${nextStatusLabel} » ?`
            : `Voulez-vous changer l’état de ces ${printableContracts.length} contrats en « ${nextStatusLabel} » ?`
        );
        if (shouldMarkAsPrinted) {
          changeContractsStatus.mutate({
            workspaceId,
            contractIds: printableContracts.map(contract => contract.id),
            status: nextStatus
          });
        }
      }
      if (user) {
        appendPrintHistory(user.id, workspaceId, printableContracts, {
          partial: isPartialPrint
        });
      }
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printableContracts, workspaceId, changeContractsStatus, user, can, pageSelection, ministersReady]);

  if (isLoading) {
    return <div className="card">Chargement des contrats…</div>;
  }

  if (!data || data.length === 0) {
    return <div className="card">Aucun contrat à imprimer.</div>;
  }

  return (
    <div className="print-stack">
      <div className="section-header print-header no-print">
        <div className="print-heading">
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
                <svg width="22" height="28" viewBox="0 0 32 40" fill="none" aria-hidden="true">
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
          <button className="btn btn-primary" onClick={handlePrint} disabled={!ministersReady || pageSelection.length === 0 || printableContracts.length === 0}>
            Imprimer
          </button>
        </div>
      </div>

      {addingContracts && <div className="no-print"><PrintAddContractsDialog workspaceId={workspaceId} contracts={printableContracts} onAdd={addContracts} onClose={() => setAddingContracts(false)} /></div>}
      <div className={`print-preview-layout${indexVisible ? "" : " is-index-hidden"}`}>
        <aside className="print-index-panel no-print">
          <div className="print-index-toolbar">
            <button
              className="btn btn-outline"
              title={indexVisible ? "Masquer la liste" : "Afficher la liste"}
              aria-label={indexVisible ? "Masquer la liste" : "Afficher la liste"}
              aria-expanded={indexVisible}
              aria-controls="print-contract-index"
              onClick={() => setIndexVisible(visible => !visible)}
            >
              {indexVisible ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
            </button>
            <button className="btn btn-outline" onClick={handlePrintList} disabled={printableContracts.length === 0}>
              Imprimer la Liste
            </button>
            <button type="button" className="btn btn-outline print-add-button" aria-label="Ajouter des contrats" title="Ajouter des contrats" aria-haspopup="dialog" onClick={() => setAddingContracts(true)}>
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <nav id="print-contract-index" hidden={!indexVisible} ref={indexRef} className="print-contract-index no-print" aria-label="Contrats sélectionnés">
            <ol>
              {orderedContracts.map((contract, index) => (
                <PrintContractIndexItem
                  key={contract.id}
                  contract={contract}
                  index={index}
                  active={activeContractId === contract.id}
                  excluded={excludedIds.has(contract.id)}
                  onToggle={() => toggleContract(contract.id)}
                />
              ))}
            </ol>
          </nav>
        </aside>
        <div ref={documentsRef} className="print-preview-documents">
          <ContractDocuments
            contracts={printableContracts}
            workspaceId={workspaceId}
            pageSelection={pageSelection}
          />
        </div>
      </div>
    </div>
  );
}
