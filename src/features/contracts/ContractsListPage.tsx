import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth";
import {
  useAssignContractsToDossier,
  useContractsList,
  useDeleteContract,
  usePrintJob,
  useChangeContractsStatus,
  useChangeContractsDuration,
  useUpdateContractComment
} from "./contractsApi";
import { useAppUsers } from "../auth/usersApi";
import { Contract, ContractDateFilterMode, ContractStatus } from "../../data/types";
import { Pagination } from "../../app/components/Pagination";
import { formatCurrency } from "../../lib/format";
import { getDataProvider } from "../../data/dataProvider";
import { useDossierContractMetrics, useDossiersList } from "../dossiers/dossiersApi";
import { DossiersInlinePanel } from "../dossiers/DossiersInlinePanel";
import {
  getCurrentFiscalYearStart,
  getTodayDateInputValue
} from "../../lib/contractDateFilters";
import {
  PrintHistoryEntry,
  isPrintHistoryDuplicate,
  loadPrintHistory,
  savePrintHistory
} from "../../lib/printHistory";
import { createId } from "../../lib/uuid";

type ContractsView = "contracts" | "dossiers";

const STATUS_FILTER_OPTIONS: { id: ContractStatus; label: string }[] = [
  { id: "saisie", label: "Saisie" },
  { id: "correction", label: "Correction" },
  { id: "imprime", label: "Imprimé" },
  { id: "signe", label: "Signé" },
  { id: "transfere", label: "Transféré" },
  { id: "classe", label: "Classé" }
];

const STATUS_MENU_OPTIONS: { id: ContractStatus; label: string }[] = [
  { id: "saisie", label: "Saisie" },
  { id: "correction", label: "Correction" },
  { id: "impression_partiel", label: "Imp. Part." },
  { id: "imprime", label: "Imprimé" },
  { id: "signe", label: "Signé" },
  { id: "transfere", label: "Transféré" },
  { id: "classe", label: "Classé" }
];

export function ContractsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workspaceId = user?.workspaceId ?? "";
  const userId = user?.id ?? "";

  const [printHistoryOpen, setPrintHistoryOpen] = useState(false);
  const [printHistory, setPrintHistory] = useState<PrintHistoryEntry[]>(() =>
    loadPrintHistory(userId, workspaceId)
  );
  const [undoAction, setUndoAction] = useState<{
    entry: PrintHistoryEntry;
    index: number;
    label: string;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualFirstName, setManualFirstName] = useState("");
  const [manualLastName, setManualLastName] = useState("");
  const [manualNif, setManualNif] = useState("");
  const [manualNinu, setManualNinu] = useState("");
  const [manualPosition, setManualPosition] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ContractsView>("contracts");
  const [showAll, setShowAll] = useState(() => localStorage.getItem("contracts_view_all") === "true");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "all">("all");
  const [dossierFilterId, setDossierFilterId] = useState<string | null>(null);
  const [dateFilterMode, setDateFilterMode] = useState<ContractDateFilterMode>("all");
  const [dateFilterDate, setDateFilterDate] = useState(() => getTodayDateInputValue());
  const [dateFilterStart, setDateFilterStart] = useState(() => getTodayDateInputValue());
  const [dateFilterEnd, setDateFilterEnd] = useState(() => getTodayDateInputValue());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"createdAt_desc" | "createdAt_asc" | "name_asc" | "name_desc">(
    "createdAt_desc"
  );
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [selected, setSelected] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [bulkDossierId, setBulkDossierId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkDuration, setBulkDuration] = useState<number | "">("");
  const [pendingAssignIds, setPendingAssignIds] = useState<string[] | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<"main" | "dossiers" | "status">("main");
  const [menuMode, setMenuMode] = useState<"main" | "status">("main");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState<string | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
        setMenuView("main");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    setPrintHistory(loadPrintHistory(userId, workspaceId));
  }, [userId, workspaceId]);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    const handleFocus = () => setPrintHistory(loadPrintHistory(userId, workspaceId));
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [userId, workspaceId]);

  const toggleShowAll = () => {
    const newValue = !showAll;
    setShowAll(newValue);
    localStorage.setItem("contracts_view_all", String(newValue));
    setPage(1);
  };

  const queryParams = {
    workspaceId,
    query: query.trim() ? query : undefined,
    sort,
    page,
    pageSize,
    onlyMine: !showAll,
    userId,
    status: statusFilter !== "all" ? statusFilter : undefined,
    dossierId: dossierFilterId ?? undefined,
    dateFilterMode: dateFilterMode !== "all" ? dateFilterMode : undefined,
    dateFilterDate: dateFilterMode === "day" ? dateFilterDate : undefined,
    dateFilterStart: dateFilterMode === "range" ? dateFilterStart : undefined,
    dateFilterEnd: dateFilterMode === "range" ? dateFilterEnd : undefined
  };

  const { data, isLoading } = useContractsList(queryParams);

  // Prefetch next page for a smoother offline experience
  const queryClient = useQueryClient();
  useEffect(() => {
    if (data?.hasMore) {
      const nextPageParams = { ...queryParams, page: page + 1 };
      queryClient.prefetchQuery({
        queryKey: ["contracts", nextPageParams],
        queryFn: () => getDataProvider().contracts.list(nextPageParams),
      });
    }
  }, [data, page, queryParams, queryClient]);

  const printJob = usePrintJob();
  const assignToDossier = useAssignContractsToDossier();
  const changeContractsStatus = useChangeContractsStatus();
  const changeContractsDuration = useChangeContractsDuration();
  const deleteContract = useDeleteContract();
  const updateContractComment = useUpdateContractComment();
  const { data: dossiers = [] } = useDossiersList(workspaceId);
  const { data: dossierMetrics = {} } = useDossierContractMetrics(workspaceId);
  const { data: appUsers = [] } = useAppUsers();

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    appUsers.forEach(u => {
      map[u.id] = u.fullName;
    });
    return map;
  }, [appUsers]);

  const items = data?.items ?? [];

  // Collect all existing tags from all contracts for autocomplete
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    items.forEach(c => {
      if (c.commentaire) {
        const matches = c.commentaire.match(/#[\w\u00C0-\u017E]+/g);
        if (matches) matches.forEach(t => tagSet.add(t));
      }
    });
    return Array.from(tagSet).sort();
  }, [items]);

  const openComment = useCallback((contractId: string, currentComment: string | null) => {
    setCommentOpen(contractId);
    setCommentDraft(prev => ({ ...prev, [contractId]: currentComment ?? "" }));
    setTagQuery(null);
    setTagSuggestions([]);
    setTimeout(() => commentInputRef.current?.focus(), 50);
  }, []);

  const saveComment = useCallback((contractId: string) => {
    const value = (commentDraft[contractId] ?? "").trim() || null;
    updateContractComment.mutate({ id: contractId, workspaceId, commentaire: value });
    setCommentOpen(null);
    setTagQuery(null);
    setTagSuggestions([]);
  }, [commentDraft, workspaceId, updateContractComment]);

  const handleCommentInput = useCallback((contractId: string, value: string) => {
    setCommentDraft(prev => ({ ...prev, [contractId]: value }));
    // Detect if user just typed a # or is inside a #word
    const lastHash = value.lastIndexOf("#");
    if (lastHash !== -1) {
      const afterHash = value.slice(lastHash + 1);
      // Only suggest if no space after the last #
      if (!afterHash.includes(" ")) {
        const q = afterHash.toLowerCase();
        setTagQuery(q);
        setTagSuggestions(allTags.filter(t => t.toLowerCase().startsWith("#" + q) && t !== "#" + q));
        return;
      }
    }
    setTagQuery(null);
    setTagSuggestions([]);
  }, [allTags]);

  const applyTag = useCallback((contractId: string, tag: string) => {
    const current = commentDraft[contractId] ?? "";
    const lastHash = current.lastIndexOf("#");
    const before = lastHash !== -1 ? current.slice(0, lastHash) : current;
    const newValue = before + tag + " ";
    setCommentDraft(prev => ({ ...prev, [contractId]: newValue }));
    setTagQuery(null);
    setTagSuggestions([]);
    setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
        commentInputRef.current.setSelectionRange(newValue.length, newValue.length);
      }
    }, 10);
  }, [commentDraft]);

  // Parse comment: render tags as highlighted pills inline
  function renderCommentWithTags(text: string) {
    const parts = text.split(/(#[\w\u00C0-\u017E]+)/g);
    return parts.map((part, i) =>
      part.startsWith("#") ? (
        <span key={i} className="comment-tag">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }
  const contextContract = contextMenu
    ? items.find((contract) => contract.id === contextMenu.id) ?? null
    : null;
  const hasSelection = selected.length > 0;
  const allSelected = useMemo(
    () => items.length > 0 && items.every((contract) => selected.includes(contract.id)),
    [items, selected]
  );
  const dossiersById = useMemo(
    () => new Map(dossiers.map((dossier) => [dossier.id, dossier])),
    [dossiers]
  );
  const fiscalYearStartLabel = useMemo(
    () => getCurrentFiscalYearStart().toLocaleDateString("fr-FR"),
    []
  );
  const isDateRangeInvalid =
    Boolean(dateFilterStart) &&
    Boolean(dateFilterEnd) &&
    dateFilterStart > dateFilterEnd;
  const hasActiveFilters =
    statusFilter !== "all" ||
    Boolean(dossierFilterId) ||
    dateFilterMode !== "all" ||
    query.trim().length > 0;

  function clearFilters() {
    const today = getTodayDateInputValue();
    setStatusFilter("all");
    setDossierFilterId(null);
    setDateFilterMode("all");
    setDateFilterDate(today);
    setDateFilterStart(today);
    setDateFilterEnd(today);
    setQuery("");
    setPage(1);
    setContextMenu(null);
  }

  function isExpanded(id: string) {
    return expandedIds.includes(id);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelection(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      const remaining = selected.filter((id) => !items.some((item) => item.id === id));
      setSelected(remaining);
      return;
    }
    const next = new Set(selected);
    items.forEach((item) => next.add(item.id));
    setSelected(Array.from(next));
  }

  function handlePrint(ids: string[]) {
    if (ids.length === 0) return;
    printJob.mutate({ workspaceId, ids });
    navigate(`/app/contrats/print?ids=${ids.join(",")}`);
  }

  function formatPrintHistoryLine(entry: PrintHistoryEntry) {
    const firstName = entry.firstName?.trim() ? entry.firstName : "—";
    const lastName = entry.lastName?.trim() ? entry.lastName.toUpperCase() : "—";
    const nif = entry.nif?.trim() ? entry.nif : "—";
    const ninu = entry.ninu?.trim() ? entry.ninu : "—";
    const position = entry.position?.trim() ? entry.position : "—";
    return `${firstName}, ${lastName}, ${nif}, ${ninu}, ${position}`;
  }

  function updatePrintHistory(
    updater:
      | PrintHistoryEntry[]
      | ((prev: PrintHistoryEntry[]) => PrintHistoryEntry[])
  ) {
    setPrintHistory((prev) => {
      const next = typeof updater === "function" ? (updater as (p: PrintHistoryEntry[]) => PrintHistoryEntry[])(prev) : updater;
      savePrintHistory(userId, workspaceId, next);
      return next;
    });
  }

  function resetManualEntryForm() {
    setManualFirstName("");
    setManualLastName("");
    setManualNif("");
    setManualNinu("");
    setManualPosition("");
    setManualError(null);
  }

  function openManualEntryForm() {
    resetManualEntryForm();
    setManualEntryOpen(true);
  }

  function handleManualEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lastName = manualLastName.trim();
    if (!lastName) {
      setManualError("Le nom est obligatoire.");
      return;
    }
    const entry: PrintHistoryEntry = {
      id: createId(),
      contractId: `manual-${createId()}`,
      firstName: manualFirstName.trim(),
      lastName,
      nif: manualNif.trim() || null,
      ninu: manualNinu.trim() || null,
      position: manualPosition.trim(),
      printedAt: new Date().toISOString(),
      partial: false
    };
    if (isPrintHistoryDuplicate(printHistory, entry.nif, entry.ninu)) {
      setManualError("Entrée déjà présente (NIF ou NINU).");
      return;
    }
    updatePrintHistory([...printHistory, entry]);
    setManualEntryOpen(false);
    setManualError(null);
    setActionMessage("Entrée ajoutée.");
  }

  function clearUndoTimer() {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  function enqueueUndo(entry: PrintHistoryEntry, index: number, label: string) {
    clearUndoTimer();
    setUndoAction({ entry, index, label });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoAction(null);
      undoTimerRef.current = null;
    }, 3000);
  }

  function handleUndo() {
    if (!undoAction) return;
    updatePrintHistory((prev) => {
      const next = [...prev];
      const safeIndex = Math.min(undoAction.index, next.length);
      next.splice(safeIndex, 0, undoAction.entry);
      return next;
    });
    clearUndoTimer();
    setUndoAction(null);
  }

  function removePrintHistoryEntry(entryId: string, label: string) {
    updatePrintHistory((prev) => {
      const index = prev.findIndex((entry) => entry.id === entryId);
      if (index === -1) return prev;
      const entry = prev[index];
      const next = prev.filter((item) => item.id !== entryId);
      enqueueUndo(entry, index, label);
      return next;
    });
  }

  function handlePrintHistoryPartial(entryId: string) {
    removePrintHistoryEntry(entryId, "Entrée marquée Imp. Part.");
  }

  function handleRemovePrintHistoryEntry(entryId: string) {
    removePrintHistoryEntry(entryId, "Entrée retirée.");
  }

  function resetPrintHistory() {
    updatePrintHistory([]);
    clearUndoTimer();
    setUndoAction(null);
  }

  function escapeCsv(value: string) {
    if (value.includes(";") || value.includes("\"") || value.includes("\n")) {
      return `"${value.replace(/\"/g, "\"\"")}"`;
    }
    return value;
  }

  async function handleExportCsv() {
    if (selected.length === 0) return;
    try {
      const provider = getDataProvider();
      const contracts = await provider.contracts.getByIds(selected, workspaceId);
      const header =
        "sexe; Nom; Prenom; Nif; Ninu; Poste; Affectation; Salaire en chiffre; Salaire en Lettre; Adresse";
      const rows = contracts.map((contract) =>
        [
          contract.gender,
          contract.lastName,
          contract.firstName,
          contract.nif ?? "",
          contract.ninu ?? "",
          contract.position,
          contract.assignment,
          contract.salaryNumber.toString().replace(".", ","),
          contract.salaryText,
          contract.address
        ]
          .map((value) => escapeCsv(String(value)))
          .join("; ")
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contrats_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setActionError("Impossible d'exporter les contrats en CSV.");
    }
  }

  async function assignContracts(ids: string[], dossierId: string | null) {
    if (ids.length === 0) return;

    setActionMessage(null);
    setActionError(null);

    try {
      const updatedCount = await assignToDossier.mutateAsync({
        workspaceId,
        contractIds: ids,
        dossierId
      });

      if (dossierId) {
        const dossierName = dossiersById.get(dossierId)?.name ?? "dossier sélectionné";
        setActionMessage(`${updatedCount} contrat(s) affecté(s) au dossier "${dossierName}".`);
      } else {
        setActionMessage(`${updatedCount} contrat(s) retiré(s) de leur dossier.`);
      }
    } catch (error) {
      console.error(error);
      setActionError("Impossible de modifier le dossier des contrats sélectionnés.");
    }
  }

  function requestCreateDossierAndAssign(ids: string[]) {
    if (ids.length === 0) return;
    setActiveView("dossiers");
    setPendingAssignIds(ids);
    setActionError(null);
    setActionMessage(
      "Créez un dossier dans l'onglet Dossiers. La sélection sera affectée automatiquement."
    );
  }

  async function handleDossierCreated(dossierId: string) {
    setBulkDossierId(dossierId);
    if (!pendingAssignIds || pendingAssignIds.length === 0) {
      return;
    }
    const ids = [...pendingAssignIds];
    setPendingAssignIds(null);
    setActiveView("contracts");
    await assignContracts(ids, dossierId);
  }

  function handleAssignSelectedToDossier() {
    if (!bulkDossierId) {
      setActionError("Choisissez un dossier avant l'affectation.");
      return;
    }
    void assignContracts(selected, bulkDossierId);
  }

  async function handleChangeStatus(ids: string[], newStatus: ContractStatus) {
    if (ids.length === 0) return;
    setActionMessage(null);
    setActionError(null);
    try {
      await changeContractsStatus.mutateAsync({
        workspaceId,
        contractIds: ids,
        status: newStatus
      });
      const label = getContractStatusLabel(newStatus);
      setActionMessage(`${ids.length} contrat(s) passé(s) à l'état "${label}".`);
    } catch (error) {
      console.error(error);
      setActionError("Impossible de modifier l'état des contrats sélectionnés.");
    }
  }

  function handleApplyBulkStatus() {
    if (!bulkStatus) return;
    void handleChangeStatus(selected, bulkStatus as ContractStatus);
    setBulkStatus("");
    setSelected([]);
  }

  async function handleApplyBulkDuration() {
    if (selected.length === 0 || !bulkDuration) return;
    setActionMessage(null);
    setActionError(null);
    try {
      await changeContractsDuration.mutateAsync({
        workspaceId,
        contractIds: selected,
        durationMonths: Number(bulkDuration)
      });
      setActionMessage(`${selected.length} contrat(s) mis à jour avec une durée de ${bulkDuration} mois.`);
      setBulkDuration("");
      setSelected([]);
    } catch (error) {
      console.error(error);
      setActionError("Impossible de modifier la durée des contrats sélectionnés.");
    }
  }

  function handleContextMenu(
    event: React.MouseEvent<HTMLDivElement>,
    contractId: string
  ) {
    event.preventDefault();
    setContextMenu({
      id: contractId,
      x: event.clientX,
      y: event.clientY
    });
    setMenuMode("main");
    setMenuView("main");
  }


  async function handleContextAssignToDossier(dossierId: string | null) {
    if (!contextMenu) return;
    const contractId = contextMenu.id;
    setContextMenu(null);
    await assignContracts([contractId], dossierId);
  }

  function handleContextFromButton(
    event: React.MouseEvent,
    contractId: string,
    mode: "main" | "status" = "main"
  ) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const estHeight =
      contractId === "date-filter-trigger"
        ? 470
        : contractId === "filter-trigger"
          ? 320
          : contractId === "sort-trigger"
            ? 240
            : contractId === "bulk-dossier-trigger"
              ? 260
            : mode === "status"
              ? 230
              : 360;
    const padding = 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    
    let y = rect.bottom + 8;
    if (spaceBelow < estHeight) {
      y = rect.top - estHeight - 8;
    }

    setContextMenu({
      id: contractId,
      x: Math.min(window.innerWidth - 260, Math.max(padding, rect.left - 160)),
      y: Math.max(padding, y)
    });
    setMenuView(contractId === "bulk-dossier-trigger" ? "dossiers" : "main");
    setMenuMode(mode);
  }

  function openDossierMenu(event: React.MouseEvent, contractId: string) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const estHeight = 260;
    const padding = 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    let y = rect.bottom + 8;
    if (spaceBelow < estHeight) {
      y = rect.top - estHeight - 8;
    }

    setContextMenu({
      id: contractId,
      x: Math.min(window.innerWidth - 260, Math.max(padding, rect.left - 160)),
      y: Math.max(padding, y)
    });
    setMenuView("dossiers");
    setMenuMode("main");
  }

  function getDossierLabel(dossierId: string | null | undefined) {
    if (!dossierId) return "Sans dossier";
    const dossier = dossiersById.get(dossierId);
    if (!dossier) {
      return "Dossier introuvable";
    }
    const tags: string[] = [];
    if (dossier.isEphemeral) {
      tags.push("Éphémère");
    }
    if (dossier.priority === "urgence") {
      tags.push("Urgence");
    }
    return tags.length > 0 ? `${dossier.name} · ${tags.join(" · ")}` : dossier.name;
  }

  function getDossierBadgeStyle(dossierId: string | null | undefined) {
    if (!dossierId) {
      return undefined;
    }
    const dossier = dossiersById.get(dossierId);
    if (!dossier) {
      return undefined;
    }

    if (dossier.priority === "urgence") {
      return {
        borderColor: "#f59e0b",
        color: "#b45309",
        backgroundColor: "#fff7ed"
      };
    }

    if (dossier.isEphemeral) {
      return {
        borderColor: "#cbd5e1",
        color: "#475569",
        backgroundColor: "#f8fafc"
      };
    }

    return {
      borderColor: "#86efac",
      color: "#166534",
      backgroundColor: "#f0fdf4"
    };
  }

  function getDossierTooltip(dossierId: string | null | undefined) {
    if (!dossierId) return "";
    const dossier = dossiersById.get(dossierId);
    if (!dossier) return "";
    const deadlineLabel = dossier.deadlineDate
      ? new Date(dossier.deadlineDate).toLocaleDateString("fr-FR")
      : "—";
    const metrics = dossierMetrics[dossierId];
    const assignedCount = metrics?.assignedCount ?? 0;
    const targetCount = dossier.contractTargetCount ?? 0;
    return `Échéance: ${deadlineLabel} · Quantité: ${assignedCount} · Objectif: ${targetCount}`;
  }

  function getContractStatusLabel(status: string): string {
    switch (status) {
      case "draft": return "Brouillon";
      case "saisie": return "Saisie";
      case "correction": return "Correction";
      case "impression_partiel": return "Impression partiel";
      case "imprime": return "Imprimé";
      case "signe": return "Signé";
      case "transfere": return "Transféré";
      case "classe": return "Classé";
      case "final": return "Final";
      default: return status;
    }
  }

  function getContractStatusBadgeClass(status: string): string {
    switch (status) {
      case "draft":
      case "saisie": return "badge-saisie";
      case "correction": return "badge-correction";
      case "impression_partiel": return "badge-imprime"; // Standardized to imprime-like for simplicity
      case "imprime": return "badge-imprime";
      case "signe": return "badge-signe";
      case "transfere": return "badge-transfere";
      case "classe": return "badge-classe";
      case "final": return "badge-final";
      default: return "";
    }
  }

  function getStatusTooltip(contract: Contract) {
    const createdLabel = new Date(contract.createdAt).toLocaleDateString("fr-FR");
    const createdBy = user?.name ?? "Administrateur";
    const parts = [`Date de création: ${createdLabel} -> ${createdBy}`];
    if (contract.updatedAt && contract.updatedAt !== contract.createdAt) {
      const updatedLabel = new Date(contract.updatedAt).toLocaleDateString("fr-FR");
      const updatedBy = user?.name ?? "Administrateur";
      parts.push(`Date dernière modif: ${updatedLabel} -> ${updatedBy}`);
    }
    return parts.join("\n");
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildPrintHistoryHtml(entries: PrintHistoryEntry[]) {
    const dateLabel = new Date().toLocaleDateString("fr-FR");
    const lines = entries
      .map((entry, index) => {
        const line = escapeHtml(formatPrintHistoryLine(entry));
        const tag = entry.partial ? `<span class="tag">Imp. Part.</span>` : "";
        return `<div class="line"><span class="num">${index + 1}.</span><span class="text">${line}</span>${tag}</div>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Historique des impressions</title>
    <style>
      @page { size: letter; margin: 0.6in; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Inter", system-ui, sans-serif; color: #0f172a; background: #fff; }
      h1 { font-size: 18px; margin: 0 0 6px; }
      .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
      .list { display: flex; flex-direction: column; gap: 8px; }
      .line { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 12px; }
      .num { width: 22px; flex-shrink: 0; font-weight: 700; color: #1e293b; }
      .text { flex: 1; }
      .tag { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
      .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
      .toolbar button { border: 1px solid #cbd5f5; background: #eef2ff; color: #1e3a8a; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
      .signature { margin-top: 32px; display: flex; justify-content: space-between; gap: 24px; }
      .sig-box { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 12px; color: #475569; text-align: center; }
      @media print { .toolbar { display: none; } }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button onclick="window.print()">Imprimer</button>
    </div>
    <h1>Historique des impressions</h1>
    <div class="meta">Date: ${escapeHtml(dateLabel)}</div>
    <div class="list">
      ${lines || `<div class="line"><span class="text">Aucune entrée.</span></div>`}
    </div>
    <div class="signature">
      <div class="sig-box">Signature 1</div>
      <div class="sig-box">Signature 2</div>
    </div>
  </body>
</html>`;
  }

  function printHtmlWithIframe(html: string, onAfterPrint?: () => void) {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.visibility = "hidden";
    frame.srcdoc = html;
    document.body.appendChild(frame);

    const cleanup = () => {
      frame.remove();
    };

    const contentWindow = frame.contentWindow;
    if (!contentWindow) {
      cleanup();
      return false;
    }

    let didPrint = false;
    let finished = false;
    const triggerPrint = () => {
      if (didPrint) return;
      didPrint = true;
      contentWindow.focus();
      contentWindow.print();
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      onAfterPrint?.();
    };

    contentWindow.addEventListener("afterprint", finish, { once: true });
    window.addEventListener("focus", finish, { once: true });
    frame.onload = triggerPrint;
    setTimeout(triggerPrint, 600);
    return true;
  }

  function buildAssignmentLetterHtml(contract: Contract) {
    const fullName = `${contract.lastName} ${contract.firstName}`.trim();
    const title = contract.gender === "Femme" ? "Madame" : "Monsieur";
    const nif = contract.nif ? `NIF: ${contract.nif}` : "";
    const ninu = contract.ninu ? `NINU: ${contract.ninu}` : "";
    const salary = `${formatCurrency(contract.salaryNumber)} (${contract.salaryText})`;
    const address = contract.address || "—";
    const dateLabel = new Date().toLocaleDateString("fr-FR");

    return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lettre d'affectation</title>
    <style>
      @page { size: letter; margin: 0.7in; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Georgia", "Times New Roman", serif; color: #0f172a; background: #fff; }
      .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
      .toolbar button { border: 1px solid #cbd5f5; background: #eef2ff; color: #1e3a8a; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
      .page { min-height: 10.5in; }
      h1 { text-align: center; font-size: 18px; margin: 12px 0 20px; text-transform: uppercase; letter-spacing: 0.08em; }
      .meta { font-size: 12px; color: #475569; display: flex; justify-content: space-between; margin-bottom: 20px; }
      .block { margin-bottom: 16px; line-height: 1.6; }
      .signature { margin-top: 48px; display: flex; justify-content: space-between; font-size: 12px; color: #475569; }
      .signature div { width: 45%; border-top: 1px solid #cbd5f5; padding-top: 6px; text-align: center; }
      @media print { .toolbar { display: none; } }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button onclick="window.print()">Imprimer</button>
    </div>
    <div class="page">
      <h1>Lettre d'affectation</h1>
      <div class="meta">
        <div>Date: ${escapeHtml(dateLabel)}</div>
        <div>${escapeHtml(nif)} ${escapeHtml(ninu)}</div>
      </div>
      <div class="block">
        Nous informons que ${escapeHtml(title)} <strong>${escapeHtml(fullName)}</strong> est affecté(e)
        au poste de <strong>${escapeHtml(contract.position || "—")}</strong>, à
        <strong>${escapeHtml(contract.assignment || "—")}</strong>.
      </div>
      <div class="block">
        Adresse déclarée: ${escapeHtml(address)}.
      </div>
      <div class="block">
        Salaire de référence: <strong>${escapeHtml(salary)}</strong>.
      </div>
      <div class="signature">
        <div>Responsable RH</div>
        <div>Signature</div>
      </div>
    </div>
  </body>
</html>`;
  }

  function handleAssignmentLetter(contract: Contract) {
    const letterHtml = buildAssignmentLetterHtml(contract);
    const letterWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!letterWindow) {
      setActionError("Impossible d'ouvrir la lettre d'affectation.");
      return;
    }
    letterWindow.document.open();
    letterWindow.document.write(letterHtml);
    letterWindow.document.close();
  }

  function handlePrintHistoryList() {
    if (printHistory.length === 0) return;
    const historyHtml = buildPrintHistoryHtml(printHistory);
    const historyWindow = window.open("", "_blank", "noopener,noreferrer");
    const confirmReset = () => {
      const confirmed = window.confirm("Réinitialiser la liste après impression ?");
      if (confirmed) {
        resetPrintHistory();
      }
    };

    if (!historyWindow) {
      const printed = printHtmlWithIframe(historyHtml, confirmReset);
      if (!printed) {
        setActionError("Impossible d'ouvrir l'historique d'impression.");
      }
      return;
    }

    historyWindow.document.open();
    historyWindow.document.write(historyHtml);
    historyWindow.document.close();
    historyWindow.focus();
    let didPrint = false;
    const triggerPrint = () => {
      if (didPrint) return;
      didPrint = true;
      historyWindow.focus();
      historyWindow.print();
    };
    historyWindow.onload = triggerPrint;
    setTimeout(triggerPrint, 600);
    historyWindow.onafterprint = () => {
      historyWindow.close();
      confirmReset();
    };
  }

  async function handleDeleteContract(contractId: string) {
    if (!contractId) return;
    const confirmed = window.confirm("Supprimer ce contrat ? Cette action est irréversible.");
    if (!confirmed) return;
    setActionError(null);
    setActionMessage(null);
    try {
      await deleteContract.mutateAsync({ id: contractId, workspaceId });
      setSelected((prev) => prev.filter((id) => id !== contractId));
      setActionMessage("Contrat supprimé.");
    } catch (error) {
      console.error(error);
      setActionError("Impossible de supprimer le contrat.");
    }
  }

  return (
    <div className="contracts-page">
      <header className="section-header" style={{ marginBottom: "16px" }}>
        <div className="toolbar-unified">
          <div className="view-switch-unified">
            <button
              className={`view-pill-unified ${activeView === "contracts" ? "active" : ""}`}
              onClick={() => setActiveView("contracts")}
            >
              <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>description</span>
              Contrats
            </button>
            <button
              className={`view-pill-unified ${activeView === "dossiers" ? "active" : ""}`}
              onClick={() => setActiveView("dossiers")}
            >
              <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>folder</span>
              Dossiers
            </button>
            <button
              className="view-pill-unified"
              onClick={() => navigate("/app/contrats/nouveau")}
              style={{ color: "var(--accent)" }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>add_circle</span>
              Nouveau
            </button>
          </div>

          <div className="toolbar-divider" />

          {activeView === "contracts" && (
            <>
              <div className="search-field-unified">
                <span className="material-symbols-rounded icon">search</span>
                <input
                  className="input"
                  placeholder="Rechercher par nom, NIF, poste..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                />
              </div>

              {dossierFilterId ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setDossierFilterId(null); setPage(1); }}
                  title="Retirer le filtre dossier"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>folder</span>
                  Dossier: {dossiersById.get(dossierFilterId)?.name ?? "Sélection"}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}

              <button 
                className={`icon-btn ${statusFilter !== "all" ? "primary" : ""}`}
                title="Filtrer par état"
                onClick={(e) => handleContextFromButton(e, "filter-trigger")}
              >
                <span className="material-symbols-rounded">filter_list</span>
              </button>

              <button
                className={`icon-btn ${dateFilterMode !== "all" ? "primary" : ""}`}
                title="Filtrer par date"
                onClick={(e) => handleContextFromButton(e, "date-filter-trigger")}
              >
                <span className="material-symbols-rounded">event</span>
              </button>

              <button 
                className="icon-btn"
                title="Trier"
                onClick={(e) => handleContextFromButton(e, "sort-trigger")}
              >
                <span className="material-symbols-rounded">sort</span>
              </button>

              <button
                className="icon-btn"
                title="Annuler les filtres"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                <span className="material-symbols-rounded">filter_alt_off</span>
              </button>

              <div className="toolbar-divider" />

              <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingRight: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-muted)" }}>Global</span>
                <label className="switch" style={{ transform: "scale(0.7)" }}>
                  <input type="checkbox" checked={showAll} onChange={toggleShowAll} />
                  <span className="switch-slider" />
                </label>
              </div>
            </>
          )}
        </div>
      </header>

      {actionError ? <div className="form-error">{actionError}</div> : null}
      {actionMessage ? <div className="form-success">{actionMessage}</div> : null}

      {activeView === "dossiers" ? (
        <DossiersInlinePanel
          workspaceId={workspaceId}
          onDossierCreated={(dossierId) => void handleDossierCreated(dossierId)}
        />
      ) : (
        <div className="card" style={{ padding: "0", border: "none", background: "transparent", boxShadow: "none" }}>

          {/* Bulk actions bar removed from here and moved to bottom as floating overlay */}

          {isLoading ? (
            <div className="empty-state">Chargement en cours…</div>
          ) : (
            <div className="contracts-list">
              {items.length === 0 ? (
                <div className="empty-state">Aucun contrat trouvé.</div>
              ) : (
                <>
                  <div className="contracts-header">
                    <label className="contracts-import" title="Sélectionner tout">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        aria-label="Tout sélectionner"
                      />
                      <span>Sélectionner tout</span>
                    </label>
                    <button type="button" className="contracts-import" aria-label="Importer" title="Importer">
                      <span className="material-symbols-rounded icon">file_upload</span>
                      <span>Importer</span>
                    </button>
                    <button type="button" className="contracts-import" aria-label="Collaboration" title="Collaboration">
                      <span className="material-symbols-rounded icon">group</span>
                      <span>Collaboration</span>
                    </button>
                  </div>
                  {items.map((contract) => (
                    <div
                      className={`contracts-row ${isExpanded(contract.id) ? "expanded" : ""}`}
                      key={contract.id}
                      onContextMenu={(event) => handleContextMenu(event, contract.id)}
                    >
                      <div className="contracts-cell" onClick={(e) => e.stopPropagation()}>
                        <label className="check-hit">
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={selected.includes(contract.id)}
                            onChange={() => toggleSelection(contract.id)}
                            aria-label={`Sélectionner ${contract.firstName} ${contract.lastName}`}
                          />
                        </label>
                      </div>
                      <div className="contracts-main">
                        <div className="contracts-top" style={{ alignItems: "center", justifyContent: "flex-start", gap: "8px" }}>
                          <div
                            className="contracts-name has-tooltip"
                            data-tooltip={`Sexe: ${contract.gender} · Durée: ${contract.durationMonths} mois`}
                            tabIndex={0}
                          >
                            {contract.firstName} {contract.lastName}
                          </div>

                          <div className="contracts-top-meta" style={{ display: "flex", gap: "12px", marginLeft: "4px", paddingLeft: "8px", borderLeft: "1px solid var(--border)", color: "var(--ink-muted)", fontSize: "11px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }} title="Poste">
                              <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>badge</span>
                              <span>{contract.position || "—"}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }} title="Lieu d'affectation">
                              <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>location_on</span>
                              <span>{contract.assignment || "—"}</span>
                            </div>
                          </div>
                        </div>

                        {(contract.nif || contract.ninu || contract.salaryNumber) ? (
                          <div className="contracts-ids" style={{ marginTop: "2px" }}>
                            {contract.nif && (
                              <span>NIF: <strong>{contract.nif}</strong></span>
                            )}
                            {contract.ninu && (
                              <span>NINU: <strong>{contract.ninu}</strong></span>
                            )}
                            <span
                              className="has-tooltip"
                              data-tooltip={`Poste: ${contract.position || "—"} · Affectation: ${contract.assignment || "—"}`}
                              tabIndex={0}
                            >
                              Salaire: <strong>{formatCurrency(contract.salaryNumber)}</strong>
                            </span>
                          </div>
                        ) : null}

                        <div className="contracts-badges" style={{ marginTop: "6px" }}>
                          {contract.dossierId ? (
                            <button
                              type="button"
                              className={`badge dossier-badge has-tooltip ${dossierFilterId === contract.dossierId ? "active" : ""}`}
                              style={{ ...getDossierBadgeStyle(contract.dossierId), fontSize: "11px", padding: "2px 8px" }}
                              aria-label="Filtrer par dossier"
                              data-tooltip={getDossierTooltip(contract.dossierId)}
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDossierFilterId((prev) =>
                                  prev === contract.dossierId ? null : contract.dossierId ?? null
                                );
                                setPage(1);
                              }}
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>folder</span>
                              {getDossierLabel(contract.dossierId)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="badge dossier-badge"
                              style={{ fontSize: "11px", padding: "2px 8px" }}
                              aria-label="Ajouter au dossier"
                              onClick={(event) => openDossierMenu(event, contract.id)}
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>folder</span>
                              <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>add</span>
                              {getDossierLabel(contract.dossierId)}
                            </button>
                          )}
                          <button
                            type="button"
                            className={`badge has-tooltip ${getContractStatusBadgeClass(contract.status)}`}
                            style={{ fontSize: "11px", padding: "2px 8px" }}
                            onClick={(e) => handleContextFromButton(e, contract.id, "status")}
                            data-tooltip={getStatusTooltip(contract)}
                            tabIndex={0}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>monitoring</span>
                            {getContractStatusLabel(contract.status)}
                          </button>

                          {/* Comment button / inline editor */}
                          {commentOpen === contract.id ? (
                            <div className="contract-comment-editor" style={{ position: "relative" }}>
                              <span className="material-symbols-rounded" style={{ fontSize: "14px", color: "var(--accent)", flexShrink: 0 }}>chat_bubble</span>
                              <input
                                ref={commentInputRef}
                                type="text"
                                className="contract-comment-input"
                                value={commentDraft[contract.id] ?? ""}
                                placeholder="Ajouter un commentaire… (# pour tag)"
                                onChange={e => handleCommentInput(contract.id, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    saveComment(contract.id);
                                  }
                                  if (e.key === "Escape") {
                                    setCommentOpen(null);
                                    setTagSuggestions([]);
                                  }
                                }}
                              />
                              <div className="comment-editor-actions" style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                                <button
                                  type="button"
                                  className="comment-action-btn save"
                                  onClick={(e) => { e.stopPropagation(); saveComment(contract.id); }}
                                  title="Enregistrer"
                                >
                                  <span className="material-symbols-rounded">check</span>
                                </button>
                                <button
                                  type="button"
                                  className="comment-action-btn cancel"
                                  onClick={(e) => { e.stopPropagation(); setCommentOpen(null); setTagSuggestions([]); }}
                                  title="Annuler"
                                >
                                  <span className="material-symbols-rounded">close</span>
                                </button>
                              </div>
                              {tagSuggestions.length > 0 && (
                                <ul className="tag-suggestion-list">
                                  {tagSuggestions.map(tag => (
                                    <li key={tag}>
                                      <button
                                        type="button"
                                        onMouseDown={e => { e.preventDefault(); applyTag(contract.id, tag); }}
                                      >
                                        {tag}
                                      </button>
                                    </li>
                                  ))}
                                  {tagQuery !== null && !allTags.includes("#" + tagQuery) && tagQuery.length > 0 && (
                                    <li className="tag-suggestion-new">
                                      <button
                                        type="button"
                                        onMouseDown={e => { e.preventDefault(); applyTag(contract.id, "#" + tagQuery); }}
                                      >
                                        <span className="material-symbols-rounded" style={{ fontSize: "13px" }}>add</span>
                                        Créer #{tagQuery}
                                      </button>
                                    </li>
                                  )}
                                </ul>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="badge comment-badge"
                              style={{ fontSize: "11px", padding: "2px 8px" }}
                              onClick={() => openComment(contract.id, contract.commentaire ?? null)}
                              title={contract.commentaire ? "Modifier le commentaire" : "Ajouter un commentaire"}
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>chat_bubble</span>
                              {!contract.commentaire && <span style={{ opacity: 0.7 }}>Commentaire</span>}
                            </button>
                          )}
                        </div>

                        {/* Inline comment display when comment exists and not editing */}
                        {contract.commentaire && commentOpen !== contract.id && (
                          <div
                            className="contract-comment-display"
                            onClick={() => openComment(contract.id, contract.commentaire ?? null)}
                            title="Cliquer pour modifier"
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "14px", opacity: 0.6 }}>chat_bubble</span>
                            <span className="contract-comment-text">{renderCommentWithTags(contract.commentaire)}</span>
                          </div>
                        )}

                        <div className="contracts-meta">
                          <div>
                            <span className="meta-label">Poste</span>
                            <span>{contract.position || "—"}</span>
                          </div>
                          <div>
                            <span className="meta-label">Affectation</span>
                            <span>{contract.assignment || "—"}</span>
                          </div>
                          <div>
                            <span className="meta-label">Adresse</span>
                            <span>{contract.address}</span>
                          </div>
                          <div>
                            <span className="meta-label">Sexe</span>
                            <span>{contract.gender}</span>
                          </div>
                          <div>
                            <span className="meta-label">Durée</span>
                            <span>{contract.durationMonths} mois</span>
                          </div>
                          <div>
                            <span className="meta-label">Saisie</span>
                            <span>{new Date(contract.createdAt).toLocaleDateString("fr-FR")}</span>
                          </div>
                          {contract.createdBy && (
                            <div>
                              <span className="meta-label">Saisi par</span>
                              <span>{userMap[contract.createdBy] || "Utilisateur inconnu"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="contracts-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="icon-actions">
                          <button
                            className="icon-btn"
                            onClick={() => navigate(`/app/contrats/${contract.id}`)}
                            aria-label="Voir le contrat"
                            title="Voir"
                          >
                            <span className="material-symbols-rounded">visibility</span>
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => navigate(`/app/contrats/${contract.id}/modifier`)}
                            aria-label="Modifier le contrat"
                            title="Modifier"
                          >
                            <span className="material-symbols-rounded">edit</span>
                          </button>
                          <button
                            className="icon-btn primary"
                            onClick={() => handlePrint([contract.id])}
                            aria-label="Imprimer le contrat"
                            title="Imprimer"
                          >
                            <span className="material-symbols-rounded">print</span>
                          </button>
                          <button
                            className="icon-btn"
                            onClick={(e) => handleContextFromButton(e, contract.id)}
                            aria-label="Changer l'état ou le dossier"
                            title="Plus d'actions"
                          >
                            <span className="material-symbols-rounded">more_vert</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {contextMenu && (
                <div
                  ref={contextMenuRef}
                  className="context-menu"
                  style={{ 
                    top: contextMenu.y, 
                    left: contextMenu.x, 
                    width:
                      contextMenu.id === "date-filter-trigger"
                        ? "260px"
                        : menuMode === "main"
                          ? "240px"
                          : "200px",
                    animation: "menu-in 0.15s ease-out",
                    zIndex: 1000,
                    overflow: "hidden"
                  }}
                  role="menu"
                >
                  {(contextMenu.id === "filter-trigger" || contextMenu.id === "bulk-status-trigger") ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>
                          {contextMenu.id === "filter-trigger" ? "Filtrer par état" : "Choisir l'état"}
                        </div>
                      </div>
                      <div className="context-menu-scroll" style={{ padding: "4px" }}>
                        {contextMenu.id === "filter-trigger" && (
                          <button
                            className="context-menu-item"
                            onClick={() => { setStatusFilter("all"); setContextMenu(null); setPage(1); }}
                            style={{ color: statusFilter === "all" ? "var(--accent)" : "inherit", fontWeight: statusFilter === "all" ? 600 : 400 }}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                              {statusFilter === "all" ? "radio_button_checked" : "radio_button_unchecked"}
                            </span>
                            Toutes les étapes
                          </button>
                        )}
                        {STATUS_FILTER_OPTIONS.map((st) => (
                          <button
                            key={st.id}
                            className="context-menu-item"
                            onClick={() => { 
                              if (contextMenu.id === "filter-trigger") {
                                setStatusFilter(st.id as ContractStatus); 
                                setContextMenu(null); setPage(1); 
                              } else {
                                setBulkStatus(st.id);
                                setContextMenu(null);
                              }
                            }}
                            style={{ 
                              color: (contextMenu.id === "filter-trigger" ? statusFilter === st.id : bulkStatus === st.id) ? "var(--accent)" : "inherit", 
                              fontWeight: (contextMenu.id === "filter-trigger" ? statusFilter === st.id : bulkStatus === st.id) ? 600 : 400 
                            }}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                              {(contextMenu.id === "filter-trigger" ? statusFilter === st.id : bulkStatus === st.id) ? "radio_button_checked" : "radio_button_unchecked"}
                            </span>
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : contextMenu.id === "date-filter-trigger" ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>
                          Filtrer par date
                        </div>
                      </div>
                      <div className="context-menu-scroll" style={{ padding: "4px" }}>
                        <button
                          className="context-menu-item"
                          onClick={() => {
                            setDateFilterMode("all");
                            setContextMenu(null);
                            setPage(1);
                          }}
                          style={{ color: dateFilterMode === "all" ? "var(--accent)" : "inherit", fontWeight: dateFilterMode === "all" ? 600 : 400 }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                            {dateFilterMode === "all" ? "radio_button_checked" : "radio_button_unchecked"}
                          </span>
                          Toutes les dates
                        </button>

                        <button
                          className="context-menu-item"
                          onClick={() => {
                            const today = getTodayDateInputValue();
                            setDateFilterDate(today);
                            setDateFilterStart(today);
                            setDateFilterEnd(today);
                            setDateFilterMode("day");
                            setContextMenu(null);
                            setPage(1);
                          }}
                          style={{
                            color: dateFilterMode === "day" && dateFilterDate === getTodayDateInputValue() ? "var(--accent)" : "inherit",
                            fontWeight: dateFilterMode === "day" && dateFilterDate === getTodayDateInputValue() ? 600 : 400
                          }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                            {dateFilterMode === "day" && dateFilterDate === getTodayDateInputValue() ? "radio_button_checked" : "radio_button_unchecked"}
                          </span>
                          Aujourd'hui
                        </button>

                        <button
                          className="context-menu-item"
                          onClick={() => {
                            setDateFilterMode("week");
                            setContextMenu(null);
                            setPage(1);
                          }}
                          style={{ color: dateFilterMode === "week" ? "var(--accent)" : "inherit", fontWeight: dateFilterMode === "week" ? 600 : 400 }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                            {dateFilterMode === "week" ? "radio_button_checked" : "radio_button_unchecked"}
                          </span>
                          Semaine actuelle
                        </button>

                        <button
                          className="context-menu-item"
                          onClick={() => {
                            setDateFilterMode("month");
                            setContextMenu(null);
                            setPage(1);
                          }}
                          style={{ color: dateFilterMode === "month" ? "var(--accent)" : "inherit", fontWeight: dateFilterMode === "month" ? 600 : 400 }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                            {dateFilterMode === "month" ? "radio_button_checked" : "radio_button_unchecked"}
                          </span>
                          Mois actuel
                        </button>

                        <button
                          className="context-menu-item"
                          onClick={() => {
                            setDateFilterMode("fiscal_year_current");
                            setContextMenu(null);
                            setPage(1);
                          }}
                          style={{ color: dateFilterMode === "fiscal_year_current" ? "var(--accent)" : "inherit", fontWeight: dateFilterMode === "fiscal_year_current" ? 600 : 400 }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                            {dateFilterMode === "fiscal_year_current" ? "radio_button_checked" : "radio_button_unchecked"}
                          </span>
                          Année fiscale actuelle
                        </button>

                        <div style={{ borderTop: "1px solid var(--border)", marginTop: "4px", padding: "10px" }}>
                          <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginBottom: "6px" }}>Période précise (du / au)</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px" }}>
                            <input
                              className="input"
                              type="date"
                              value={dateFilterStart}
                              onChange={(e) => setDateFilterStart(e.target.value)}
                              style={{ height: "34px", fontSize: "12px", padding: "8px 10px" }}
                            />
                            <input
                              className="input"
                              type="date"
                              value={dateFilterEnd}
                              onChange={(e) => setDateFilterEnd(e.target.value)}
                              style={{ height: "34px", fontSize: "12px", padding: "8px 10px" }}
                            />
                          </div>
                          {isDateRangeInvalid ? (
                            <div className="helper-text" style={{ color: "#b91c1c", marginTop: "6px" }}>
                              La date de début doit être antérieure ou égale à la date de fin.
                            </div>
                          ) : null}
                          <button
                            className="btn btn-outline"
                            type="button"
                            style={{ width: "100%", marginTop: "8px", justifyContent: "center" }}
                            disabled={!dateFilterStart || !dateFilterEnd || isDateRangeInvalid}
                            onClick={() => {
                              if (!dateFilterStart || !dateFilterEnd || isDateRangeInvalid) return;
                              setDateFilterMode("range");
                              setContextMenu(null);
                              setPage(1);
                            }}
                          >
                            Appliquer la période
                          </button>
                        </div>

                        <div className="helper-text" style={{ padding: "4px 10px 10px" }}>
                          Année fiscale actuelle: depuis le {fiscalYearStartLabel}
                        </div>
                      </div>
                    </>
                  ) : contextMenu.id === "sort-trigger" ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Trier par</div>
                      </div>
                      <div className="context-menu-scroll" style={{ padding: "4px" }}>
                        {[
                          { id: "createdAt_desc", label: "Plus récents", icon: "calendar_today" },
                          { id: "createdAt_asc", label: "Plus anciens", icon: "history" },
                          { id: "name_asc", label: "Nom A → Z", icon: "sort_by_alpha" },
                          { id: "name_desc", label: "Nom Z → A", icon: "sort_by_alpha" }
                        ].map((s) => (
                          <button
                            key={s.id}
                            className="context-menu-item"
                            onClick={() => { setSort(s.id as any); setContextMenu(null); }}
                            style={{ color: sort === s.id ? "var(--accent)" : "inherit", fontWeight: sort === s.id ? 600 : 400 }}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>{s.icon}</span>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : menuMode === "status" ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Changer l'état</div>
                      </div>
                      <div className="context-menu-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px", padding: "4px" }}>
                        {STATUS_MENU_OPTIONS.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            className="context-menu-item"
                            style={{ padding: "6px 8px", fontSize: "12px", borderRadius: "4px", gap: "6px" }}
                            onClick={() => {
                              void handleChangeStatus([contextMenu.id], st.id as ContractStatus);
                              setContextMenu(null);
                            }}
                          >
                            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--accent)" }} />
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : menuView === "main" ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Actions</div>
                      </div>

                      <button
                        type="button"
                        className="context-menu-item"
                        style={{ padding: "10px 12px", fontSize: "13px" }}
                        onClick={() => {
                          if (!contextContract) return;
                          toggleExpanded(contextContract.id);
                          setContextMenu(null);
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>unfold_more</span>
                        {contextContract && isExpanded(contextContract.id)
                          ? "Masquer les informations"
                          : "Afficher toutes les informations"}
                      </button>

                      <button
                        type="button"
                        className="context-menu-item"
                        style={{ padding: "10px 12px", fontSize: "13px" }}
                        onClick={() => setMenuView("status")}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>rule</span>
                        Changer l'état
                        <span className="material-symbols-rounded" style={{ marginLeft: "auto", fontSize: "16px", opacity: 0.5 }}>chevron_right</span>
                      </button>

                      <button
                        type="button"
                        className="context-menu-item"
                        style={{ padding: "10px 12px", fontSize: "13px", color: "var(--accent)", fontWeight: 600 }}
                        onClick={() => setMenuView("dossiers")}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>folder_shared</span>
                        Dossiers
                        <span className="material-symbols-rounded" style={{ marginLeft: "auto", fontSize: "16px", opacity: 0.5 }}>chevron_right</span>
                      </button>

                      <div style={{ display: "flex", gap: "1px", background: "var(--border)", marginTop: "4px" }}>
                        <button
                          type="button"
                          className="context-menu-item"
                          style={{ fontSize: "11px", flex: 1, padding: "8px", justifyContent: "center", background: "#fff", borderRadius: 0 }}
                          onClick={() => void handleContextAssignToDossier(null)}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>folder_off</span>
                          Retirer
                        </button>
                        <button
                          type="button"
                          className="context-menu-item"
                          style={{ fontSize: "11px", flex: 1, padding: "8px", justifyContent: "center", background: "#fff", borderRadius: 0 }}
                          onClick={() => {
                            const id = contextMenu.id;
                            setContextMenu(null);
                            requestCreateDossierAndAssign([id]);
                          }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>create_new_folder</span>
                          Nouveau
                        </button>
                      </div>

                      <div className="context-menu-divider" style={{ height: "1px", background: "var(--border)", margin: "6px 0" }}></div>

                      <button
                        type="button"
                        className="context-menu-item"
                        style={{ padding: "10px 12px", fontSize: "13px" }}
                        onClick={() => {
                          if (!contextContract) return;
                          setContextMenu(null);
                          handleAssignmentLetter(contextContract);
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>description</span>
                        Lettre d'affectation
                      </button>

                      <button
                        type="button"
                        className="context-menu-item"
                        style={{ padding: "10px 12px", fontSize: "13px", color: "#b91c1c", fontWeight: 600 }}
                        onClick={() => {
                          const id = contextMenu.id;
                          setContextMenu(null);
                          void handleDeleteContract(id);
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>delete</span>
                        Supprimer
                      </button>
                    </>
                  ) : menuView === "status" ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px", background: "var(--panel-muted)" }}>
                        <button 
                          className="icon-btn" 
                          style={{ width: "20px", height: "20px", padding: 0, border: "none", background: "transparent", color: "var(--ink-muted)" }}
                          onClick={() => setMenuView("main")}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>arrow_back</span>
                        </button>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700 }}>Changer l'état</div>
                      </div>

                      <div className="context-menu-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px", padding: "4px" }}>
                        {STATUS_MENU_OPTIONS.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            className="context-menu-item"
                            style={{ padding: "6px 8px", fontSize: "12px", borderRadius: "4px", gap: "6px" }}
                            onClick={() => {
                              void handleChangeStatus([contextMenu.id], st.id as ContractStatus);
                              setContextMenu(null);
                              setMenuView("main");
                            }}
                          >
                            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--accent)" }} />
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700 }}>Dossiers</div>
                      </div>
                      
                      <button
                        type="button"
                        className="context-menu-item"
                        style={{ padding: "10px 12px", fontSize: "13px", color: "var(--accent)", fontWeight: 600 }}
                        onClick={() => {
                          const id = contextMenu.id;
                          setContextMenu(null);
                          requestCreateDossierAndAssign([id]);
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>create_new_folder</span>
                        Nouveau dossier
                      </button>

                      <div className="context-menu-scroll" style={{ maxHeight: "220px", overflowY: "auto", padding: "4px" }}>
                        {dossiers.length === 0 ? (
                          <div className="context-menu-empty" style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "var(--ink-muted)" }}>Aucun dossier</div>
                        ) : (
                          dossiers.map((dossier) => (
                            <button
                              key={dossier.id}
                              type="button"
                              className="context-menu-item"
                              style={{ padding: "8px 10px", fontSize: "12px" }}
                              onClick={() => {
                                if (contextMenu.id === "bulk-dossier-trigger") {
                                  setBulkDossierId(dossier.id);
                                  setContextMenu(null);
                                } else {
                                  void handleContextAssignToDossier(dossier.id);
                                }
                              }}
                            >
                              <div
                                className="dossier-dot"
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  background:
                                    dossier.priority === "urgence"
                                      ? "#f59e0b"
                                      : dossier.isEphemeral
                                        ? "#94a3b8"
                                        : "var(--accent)"
                                }}
                              />
                              {dossier.name}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {data ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
      {/* Floating Selection Actions Bar */}
      <div className={`selection-actions-shell ${hasSelection ? "active" : ""}`}>
        <div className="selection-actions-head">
          <div className="helper-text">
            {selected.length} sélectionné(s)
          </div>
          <button
            className="icon-btn"
            style={{ border: "none", background: "transparent", width: "24px", height: "24px" }}
            type="button"
            onClick={() => setSelected([])}
            title="Tout désélectionner"
          >
            <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>close</span>
          </button>
        </div>
        <div className="selection-actions-row" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-muted)", padding: "4px", borderRadius: "10px", minWidth: "150px" }}>
            <button
               className="icon-btn"
               type="button"
               onClick={(e) => handleContextFromButton(e, "bulk-dossier-trigger")}
               title="Attribuer un dossier"
               style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
               <span className="material-symbols-rounded">folder_managed</span>
            </button>
            <div style={{ fontSize: "12px", fontWeight: 600, maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
               {bulkDossierId ? dossiersById.get(bulkDossierId)?.name : "Choisir dossier"}
            </div>
          </div>

          <div style={{ display: "flex", gap: "4px" }}>
            <button
              className="icon-btn"
              type="button"
              onClick={handleAssignSelectedToDossier}
              disabled={!bulkDossierId}
              title="Valider l'affectation"
            >
              <span className="material-symbols-rounded">check</span>
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => void assignContracts(selected, null)}
              title="Retirer du dossier"
            >
              <span className="material-symbols-rounded">folder_off</span>
            </button>
          </div>

          <div className="toolbar-divider" />

          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-muted)", padding: "4px", borderRadius: "10px", minWidth: "150px" }}>
            <button
               className="icon-btn"
               type="button"
               onClick={(e) => handleContextFromButton(e, "bulk-status-trigger")}
               title="Modifier l'état"
               style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
               <span className="material-symbols-rounded">rule</span>
            </button>
            <div style={{ fontSize: "12px", fontWeight: 600 }}>
               {bulkStatus ? getContractStatusLabel(bulkStatus as ContractStatus) : "Modifier l'état"}
            </div>
          </div>

          <button
            className="icon-btn"
            type="button"
            onClick={handleApplyBulkStatus}
            disabled={!bulkStatus}
            title="Appliquer l'état"
          >
            <span className="material-symbols-rounded">done_all</span>
          </button>

          <div className="toolbar-divider" />

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
               className="input"
               type="number"
               min="1"
               style={{ width: "60px", height: "30px", fontSize: "12px" }}
               placeholder="Mois"
               value={bulkDuration}
               onChange={(e) => setBulkDuration(e.target.value ? Number(e.target.value) : "")}
            />
            <button
              className="icon-btn"
              type="button"
              onClick={() => void handleApplyBulkDuration()}
              disabled={!bulkDuration}
              title="Appliquer durée"
            >
              <span className="material-symbols-rounded">timer</span>
            </button>
          </div>

          <div className="toolbar-divider" />

          <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
            <button
              className="icon-btn primary"
              type="button"
              onClick={() => handlePrint(selected)}
              title="Imprimer tout"
            >
              <span className="material-symbols-rounded">print</span>
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={handleExportCsv}
              title="Exporter CSV"
            >
              <span className="material-symbols-rounded">download_for_offline</span>
            </button>
          </div>
        </div>
      </div>

      {printHistoryOpen ? (
        <div className={`print-history-panel ${hasSelection ? "shifted" : ""}`}>
          <div className="print-history-header">
            <div>
              <div className="print-history-title">Historique impressions</div>
              <div className="print-history-subtitle">{printHistory.length} entrée(s)</div>
            </div>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setPrintHistoryOpen(false)}
              title="Minimiser"
              style={{ width: "28px", height: "28px" }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>expand_more</span>
            </button>
          </div>

          {printHistory.length === 0 ? (
            <div className="print-history-empty">Aucune impression enregistrée.</div>
          ) : (
            <div className="print-history-list">
              {printHistory.map((entry, index) => (
                <div key={entry.id} className="print-history-item">
                  <div className="print-history-line">
                    <span className="print-history-index">{index + 1}.</span>
                    {formatPrintHistoryLine(entry)}
                    {entry.partial ? <span className="print-history-tag">Imp. Part.</span> : null}
                  </div>
                  <div className="print-history-actions">
                    <button
                      className={`print-history-mini-btn ${entry.partial ? "active" : ""}`}
                      type="button"
                      onClick={() => handlePrintHistoryPartial(entry.id)}
                      title="Imp. Part."
                    >
                      Imp. Part.
                    </button>
                    <button
                      className="print-history-mini-btn danger"
                      type="button"
                      onClick={() => handleRemovePrintHistoryEntry(entry.id)}
                      title="Retirer"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>close</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="print-history-footer">
            <button
              className="btn btn-primary"
              type="button"
              onClick={handlePrintHistoryList}
              disabled={printHistory.length === 0}
            >
              Imprimer
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={resetPrintHistory}
              disabled={printHistory.length === 0}
            >
              Réinitialiser
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={openManualEntryForm}
            >
              Ajouter
            </button>
          </div>
        </div>
      ) : null}

      <div className={`print-history-fab ${hasSelection ? "shifted" : ""}`}>
        <button
          className="icon-btn primary"
          type="button"
          onClick={() => setPrintHistoryOpen((prev) => !prev)}
          title="Historique d'impression"
          style={{ width: "52px", height: "52px", borderRadius: "50%" }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: "22px" }}>
            {printHistoryOpen ? "close_fullscreen" : "receipt_long"}
          </span>
        </button>
      </div>

      {undoAction ? (
        <div className={`print-history-undo ${hasSelection ? "shifted" : ""}`}>
          <span>{undoAction.label}</span>
          <button className="print-history-undo-btn" type="button" onClick={handleUndo}>
            Annuler
          </button>
        </div>
      ) : null}

      {manualEntryOpen ? (
        <div className="print-history-modal">
          <div className="print-history-modal-card">
            <div className="print-history-modal-title">Ajouter à l'historique</div>
            <form onSubmit={handleManualEntrySubmit}>
              <div className="print-history-modal-grid">
                <label className="form-label">
                  Prénom
                  <input
                    className="input"
                    value={manualFirstName}
                    onChange={(event) => setManualFirstName(event.target.value)}
                  />
                </label>
                <label className="form-label">
                  Nom *
                  <input
                    className="input"
                    value={manualLastName}
                    onChange={(event) => setManualLastName(event.target.value)}
                    required
                  />
                </label>
                <label className="form-label">
                  NIF
                  <input
                    className="input"
                    value={manualNif}
                    onChange={(event) => setManualNif(event.target.value)}
                  />
                </label>
                <label className="form-label">
                  NINU
                  <input
                    className="input"
                    value={manualNinu}
                    onChange={(event) => setManualNinu(event.target.value)}
                  />
                </label>
                <label className="form-label">
                  Poste
                  <input
                    className="input"
                    value={manualPosition}
                    onChange={(event) => setManualPosition(event.target.value)}
                  />
                </label>
              </div>
              {manualError ? <div className="form-error">{manualError}</div> : null}
              <div className="print-history-modal-actions">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => {
                    setManualEntryOpen(false);
                    setManualError(null);
                  }}
                >
                  Annuler
                </button>
                <button className="btn btn-primary" type="submit">
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
