import { contractMandateWarning } from "./ContractMandateAlert";
import { useFiscalYearFilter } from "../../lib/useFiscalYearFilter";
import { useMinisters } from "../settings/ministersApi";
import { findContractMinister } from "../../lib/ministers";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import { useSalaryGrid } from "../salary-grid/salaryGridApi";
import { salaryOutsideGrid, genderedTitle, gridPositions } from "../salary-grid/salaryGrid";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { Contract, ContractDateFilterMode, ContractSort, ContractStatus, Dossier, Tag } from "../../data/types";
import { Pagination } from "../../app/components/Pagination";
import { MultiSelectDropdown } from "../../app/components/MultiSelectDropdown";
import { formatCurrency } from "../../lib/format";
import { getDataProvider } from "../../data/dataProvider";
import { useDossierContractMetrics, useDossiersList } from "../dossiers/dossiersApi";
import { DossiersInlinePanel } from "../dossiers/DossiersInlinePanel";
import { useAssignTagToContract, useCreateTag, useTags } from "./tagsApi";
import { useAddresses, useInstitutions } from "../settings/suggestionsApi";
import {
  getContractFiscalYear,
  getFiscalYearOptions,
  getFiscalYearForDate,
  getTodayDateInputValue,
  isPastFiscalYear
} from "../../lib/contractDateFilters";
import { useFiscalYear } from "../settings/settingsApi";
import { getUserDossierGroups } from "../../lib/dossier";
import { createExcelClipboardText, createExcelWorkbookBlob, type ExcelCellValue } from "../../lib/excelExport";
import { PersonAttachmentsDialog } from "../attachments/PersonAttachmentsDialog";
import { PersonAttachmentsButton } from "../attachments/PersonAttachmentsButton";
import { ContractCommentModal } from "./ContractCommentModal";
import { ContractsImportModal } from "./ContractsImportModal";
import { TagBadge } from "./TagBadge";
import { formatInstitutionAssignment } from "../institutions/institutionPrepositions";
import { useInstitutionPrepositions } from "../institutions/institutionPrepositionsApi";
import {
  applySuggestionPrefix,
  normalizeSuggestionGrammarValue
} from "../../lib/suggestionPrefixes";
import { usePrivateTasks } from "../tasks/tasksApi";
import {
  indexTasksByContractNif,
  normalizeContractNif
} from "../tasks/taskMentions";
import { ContractSyncIndicator } from "./ContractSyncIndicator";
import { usePinnedContracts } from "./pinnedContracts";
import { listContractsPinnedFirst } from "./pinnedContractOrdering";
import { getPendingOutbox } from "../../data/local/offlineStore";
import { syncSupabaseOutbox } from "../../data/supabase/supabaseProvider";
import { ContractTaskIndicator } from "./ContractTaskIndicator";
import {
  combineAssignmentAndInstitutionLocationFilters,
  getLinkedInstitutionFilters,
  updateInstitutionFilterSelection,
  type InstitutionFilterSelection
} from "./institutionLocationFilters";
import { sortContracts } from "../../lib/contractSorting";

import { useContractLists } from "../lists/listsApi";
import { listError, listName } from "../lists/listModel";
import { ContractActionsMenu, contractContextTargets } from "./ContractActionsMenu";
import { ListAssignmentDialog } from "../lists/ListAssignmentDialog";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";
import { ContractsScopeButton } from "./ContractsScopeButton";

type ContractsView = "contracts" | "dossiers";
const CONTRACT_PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;
const DURATION_FILTER_OPTIONS = Array.from({ length: 12 }, (_, index) => `${index + 1} mois`);

function readContractsPageSize() {
  const value = Number(localStorage.getItem("contracts_page_size"));
  return CONTRACT_PAGE_SIZE_OPTIONS.includes(value as any) ? value : 25;
}

const STATUS_FILTER_OPTIONS: { id: ContractStatus; label: string }[] = [
  { id: "liste", label: "Listé" },
  { id: "saisie", label: "Saisie" },
  { id: "correction", label: "Correction" },
  { id: "impression_partiel", label: "Imp. Part." },
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
  const { user, can } = useAuth();
  const { entries: salaryGrid, data: salaryGridData } = useSalaryGrid();
  const navigate = useNavigate();
  const isMobile = useIsMobileViewport();
  const listsQuery = useContractLists();
  const listsByContract = useMemo(() => new Map((listsQuery.data ?? []).flatMap(list => list.members.map(member => [member.id, list] as const))), [listsQuery.data]);
  const [listAssignmentMode, setListAssignmentMode] = useState<"assign" | "create">("assign");
  const [listAssignmentIds, setListAssignmentIds] = useState<string[] | null>(null);
  const workspaceId = user?.workspaceId ?? "";
  const userId = user?.id ?? "";
  const pinnedContracts = usePinnedContracts();
  const { fiscalYear } = useFiscalYear();
  const { registry: ministerRegistry } = useMinisters();
  const fiscalYearIsPast = isPastFiscalYear(fiscalYear);
  const currentFiscalYear = getFiscalYearForDate(new Date());

  const [activeView, setActiveView] = useState<ContractsView>("contracts");
  const [showAll, setShowAll] = useState(() => localStorage.getItem("contracts_view_all") === "true");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "all">("all");
  const [dossierFilterId, setDossierFilterId] = useState<string | null>(null);
  const [fiscalYearFilter, setFiscalYearFilter] = useFiscalYearFilter(workspaceId, userId);
  const [dateFilterMode, setDateFilterMode] = useState<ContractDateFilterMode>("all");
  const [dateFilterDate, setDateFilterDate] = useState(() => getTodayDateInputValue());
  const [dateFilterStart, setDateFilterStart] = useState(() => getTodayDateInputValue());
  const [dateFilterEnd, setDateFilterEnd] = useState(() => getTodayDateInputValue());
  const [tagFilterId, setTagFilterId] = useState<string | null>(null);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [selectedDurations, setSelectedDurations] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedCommunes, setSelectedCommunes] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ContractSort>("createdAt_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readContractsPageSize);
  const [selected, setSelected] = useState<string[]>([]);
  const [exportWithPrepositions, setExportWithPrepositions] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
    scope?: "selection";
  } | null>(null);
  const [bulkDuration, setBulkDuration] = useState<number | "">("");
  const [pendingAssignIds, setPendingAssignIds] = useState<string[] | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<"main" | "dossiers" | "status" | "export" | "tags" | "duration">("main");
  const [dossierSubmenu, setDossierSubmenu] = useState<"others" | "archived" | "classified" | null>(null);
  const [menuMode, setMenuMode] = useState<"main" | "status">("main");
  const [tagSearch, setTagSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!contextMenu || !menu) return;
    const bounds = menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - bounds.width - 8));
    const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - bounds.height - 8));
    if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu(current => current ? { ...current, x, y } : null);
    const first = menu.querySelector<HTMLElement>(menuView === "tags" ? "input" : "button:not(:disabled)");
    if (!menu.contains(document.activeElement)) first?.focus();
  }, [contextMenu, menuView, menuMode]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [contextMenu]);

  useEffect(() => {
    if (!actionMessage) return;
    const timeout = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [actionMessage]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
        setMenuView("main");
        setDossierSubmenu(null);
        setTagSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectContractsScope = (nextShowAll: boolean) => {
    setShowAll(nextShowAll);
    if (!nextShowAll) setSelectedUserIds([]);
    localStorage.setItem("contracts_view_all", String(nextShowAll));
    setActiveView("contracts");
    setPage(1);
  };

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
    localStorage.setItem("contracts_page_size", String(nextPageSize));
  }

  const positionsData = useMemo(() => gridPositions(salaryGrid), [salaryGrid]);
  const { data: institutionsData = [] } = useInstitutions(workspaceId);
  const { rules: institutionPrepositions } = useInstitutionPrepositions();
  const { data: addressesData = [] } = useAddresses(workspaceId);

  const positionOptions = useMemo(() => [...new Set(salaryGrid
    .filter(entry => entry.active)
    .flatMap(entry => [entry.masculine, entry.feminine, ...entry.aliases])
    .map(value => value.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr")), [salaryGrid]);
  const locationSelection: InstitutionFilterSelection = {
    institution: selectedAssignments,
    department: selectedDepartments,
    commune: selectedCommunes
  };
  const linkedLocationFilters = getLinkedInstitutionFilters(institutionsData, locationSelection);
  function changeLocationFilter(key: keyof InstitutionFilterSelection, values: string[]) {
    const next = updateInstitutionFilterSelection(institutionsData, locationSelection, key, values);
    setSelectedAssignments(next.institution);
    setSelectedDepartments(next.department);
    setSelectedCommunes(next.commune);
    setPage(1);
  }
  const effectiveAssignments = useMemo(
    () => combineAssignmentAndInstitutionLocationFilters(
      institutionsData,
      selectedAssignments,
      selectedDepartments,
      selectedCommunes
    ),
    [institutionsData, selectedAssignments, selectedCommunes, selectedDepartments]
  );

  const queryParams = useMemo(() => ({
    workspaceId,
    query: query.trim() ? query : undefined,
    sort,
    page,
    pageSize,
    pinnedIds: pinnedContracts.ids,
    onlyMine: !showAll,
    userId,
    createdByIds: selectedUserIds.length > 0 ? selectedUserIds : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    dossierId: dossierFilterId ?? undefined,
    fiscalYear: fiscalYearFilter,
    dateFilterMode: dateFilterMode !== "all" ? dateFilterMode : undefined,
    dateFilterDate: dateFilterMode === "day" ? dateFilterDate : undefined,
    dateFilterStart: dateFilterMode === "range" ? dateFilterStart : undefined,
    dateFilterEnd: dateFilterMode === "range" ? dateFilterEnd : undefined,
    tagId: tagFilterId ?? undefined,
    assignments: effectiveAssignments,
    positions: selectedPositions.length > 0 ? selectedPositions : undefined,
    durations: selectedDurations.length > 0 ? selectedDurations.map(value => Number.parseInt(value, 10)) : undefined
  }), [
    fiscalYearFilter,
    dateFilterDate,
    dateFilterEnd,
    dateFilterMode,
    dateFilterStart,
    dossierFilterId,
    effectiveAssignments,
    page,
    pageSize,
    pinnedContracts.ids,
    query,
    selectedPositions,
    selectedDurations,
    selectedUserIds,
    showAll,
    sort,
    statusFilter,
    tagFilterId,
    userId,
    workspaceId
  ]);

  const { data, isLoading, isFetching } = useContractsList(queryParams);
  const { data: privateTasks = [] } = usePrivateTasks();
  const privateTasksByNif = useMemo(
    () => indexTasksByContractNif(privateTasks.filter(task => task.kind !== "note")),
    [privateTasks]
  );

  // Prefetch next page for a smoother offline experience
  const queryClient = useQueryClient();
  const [pendingSync, setPendingSync] = useState(getPendingOutbox);
  const [syncOnline, setSyncOnline] = useState(navigator.onLine);
  useEffect(() => {
    const refresh = () => { setPendingSync(getPendingOutbox()); setSyncOnline(navigator.onLine); };
    window.addEventListener("contribution-offline-sync", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("contribution-offline-sync", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);
  const retryContractSync = async () => {
    await syncSupabaseOutbox();
    await queryClient.invalidateQueries({ queryKey: ["contracts"] });
  };
  useEffect(() => {
    // Prioritize refreshing the visible cached page before using the network
    // for speculative work.
    if (!isFetching && data && data.page * data.pageSize < data.total) {
      const nextPageParams = { ...queryParams, page: page + 1 };
      queryClient.prefetchQuery({
        queryKey: ["contracts", nextPageParams],
        queryFn: () => listContractsPinnedFirst(
          (listParams) => getDataProvider().contracts.list(listParams), nextPageParams
        ),
      });
    }
  }, [data, isFetching, page, queryParams, queryClient]);

  const printJob = usePrintJob();
  const assignToDossier = useAssignContractsToDossier();
  const changeContractsStatus = useChangeContractsStatus();
  const changeContractsDuration = useChangeContractsDuration();
  const deleteContract = useDeleteContract();
  const [attachmentContract, setAttachmentContract] = useState<Contract | null>(null);
  const updateContractComment = useUpdateContractComment();
  const createTag = useCreateTag();
  const assignTag = useAssignTagToContract();
  const { data: dossiers = [] } = useDossiersList(workspaceId);
  const { data: dossierMetrics = {} } = useDossierContractMetrics(workspaceId);
  const { data: tags = [] } = useTags(workspaceId);
  const { data: appUsers = [] } = useAppUsers();

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    appUsers.forEach(u => {
      map[u.id] = u.fullName;
    });
    return map;
  }, [appUsers]);

  const userFilterOptions = useMemo(() => {
    const names = appUsers.map(u => u.fullName.trim() || u.username);
    return appUsers.map((u, index) => ({
      id: u.id,
      label: names.filter(name => name === names[index]).length > 1
        ? `${names[index]} (@${u.username})` : names[index]
    })).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [appUsers]);
  const userFilterLabel = useCallback((id: string) =>
    userFilterOptions.find(option => option.id === id)?.label ?? "Utilisateur inconnu",
  [userFilterOptions]);

  const items = data?.items ?? [];

  const openComment = useCallback((contractId: string, currentComment: string | null) => {
    setCommentOpen(contractId);
    setCommentDraft(prev => ({ ...prev, [contractId]: currentComment ?? "" }));
  }, []);

  const saveComment = useCallback((contractId: string) => {
    const value = (commentDraft[contractId] ?? "").trim() || null;
    updateContractComment.mutate({ id: contractId, workspaceId, commentaire: value });
    setCommentOpen(null);
  }, [commentDraft, workspaceId, updateContractComment]);

  const handleCommentInput = useCallback((contractId: string, value: string) => {
    setCommentDraft(prev => ({ ...prev, [contractId]: value }));
  }, []);
  const contextTargetIds = contextMenu
    ? contractContextTargets(contextMenu.id, selected, contextMenu.scope === "selection") : [];
  const contextContract = contextMenu
    ? items.find((contract) => contract.id === (contextTargetIds.length === 1 ? contextTargetIds[0] : contextMenu.id)) ?? null
    : null;
  const isBulkTagContext = contextMenu?.id === "bulk-tag-trigger" || contextMenu?.scope === "selection";
  const contextTagTargetIds = isBulkTagContext
    ? selected
    : contextContract
      ? [contextContract.id]
      : [];
  const contextAssignedTagIds = new Set(
    isBulkTagContext ? [] : (contextContract?.tags ?? []).map((tag) => tag.id)
  );
  const normalizedTagSearch = tagSearch.trim().toLocaleLowerCase("fr");
  const contextTagOptions = tags.filter(
    (tag) =>
      !contextAssignedTagIds.has(tag.id) &&
      (!normalizedTagSearch ||
        tag.name.toLocaleLowerCase("fr").includes(normalizedTagSearch))
  );
  const exactContextTag = normalizedTagSearch
    ? tags.find(
        (tag) => tag.name.trim().toLocaleLowerCase("fr") === normalizedTagSearch
      )
    : undefined;
  const activeCommentContract = commentOpen
    ? items.find((contract) => contract.id === commentOpen) ?? null
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
  const dossierGroups = useMemo(() => getUserDossierGroups(dossiers, user?.id, dossierMetrics), [dossiers, user?.id, dossierMetrics]);
  const isDateRangeInvalid =
    Boolean(dateFilterStart) &&
    Boolean(dateFilterEnd) &&
    dateFilterStart > dateFilterEnd;
  const advancedFilterCount = [selectedAssignments, selectedDepartments, selectedCommunes, selectedPositions, selectedDurations, selectedUserIds]
    .filter(values => values.length > 0).length + Number(statusFilter !== "all") + Number(dateFilterMode !== "all") + Number(fiscalYearFilter !== currentFiscalYear);
  const isTodayFilterActive = dateFilterMode === "day" && dateFilterDate === getTodayDateInputValue();
  const hasActiveFilters =
    statusFilter !== "all" ||
    Boolean(dossierFilterId) ||
    Boolean(tagFilterId) ||
    dateFilterMode !== "all" ||
    fiscalYearFilter !== currentFiscalYear ||
    query.trim().length > 0 ||
    selectedAssignments.length > 0 ||
    selectedPositions.length > 0 ||
    selectedDurations.length > 0 ||
    selectedUserIds.length > 0 ||
    selectedDepartments.length > 0 ||
    selectedCommunes.length > 0;
  const hasFilterChips = Boolean(dossierFilterId || tagFilterId) ||
    [selectedAssignments, selectedPositions, selectedDurations, selectedDepartments, selectedCommunes, selectedUserIds]
      .some(values => values.length > 0);

  function clearFilters() {
    const today = getTodayDateInputValue();
    setStatusFilter("all");
    setDossierFilterId(null);
    setTagFilterId(null);
    setDateFilterMode("all");
    setFiscalYearFilter(currentFiscalYear);
    setDateFilterDate(today);
    setDateFilterStart(today);
    setDateFilterEnd(today);
    setQuery("");
    setSelectedAssignments([]);
    setSelectedPositions([]);
    setSelectedDurations([]);
    setSelectedUserIds([]);
    setSelectedDepartments([]);
    setSelectedCommunes([]);
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

  async function handlePrint(ids: string[]) {
    if (isMobile || ids.length === 0) return;
    let orderedIds = ids;
    if (ids.length > 1) {
      const selectedIdSet = new Set(ids);
      const visibleSelection = items.filter((contract) => selectedIdSet.has(contract.id));
      orderedIds = visibleSelection.length === ids.length
        ? visibleSelection.map((contract) => contract.id)
        : sortContracts(
            await getDataProvider().contracts.getByIds(ids, workspaceId),
            sort
          ).map((contract) => contract.id);
    }
    printJob.mutate({ workspaceId, ids: orderedIds });
    navigate(`/app/contrats/print?ids=${orderedIds.join(",")}`);
  }

  function buildExportRowsFromContracts(
    contracts: Contract[],
    positions: typeof positionsData,
    institutions: typeof institutionsData,
    addresses: typeof addressesData
  ) {
    const positionPrefixes = new Map(
      positions.map((position) => [normalizeSuggestionGrammarValue(position.label), position.prefix ?? null])
    );
    const institutionPrefixes = new Map(
      institutions.map((institution) => [normalizeSuggestionGrammarValue(institution.label), institution.prefix ?? null])
    );
    const addressPrefixes = new Map(
      addresses.map((address) => [normalizeSuggestionGrammarValue(address.label), address.prefix ?? null])
    );
    return [
      ["sexe", "Nom", "Prenom", "Nif", "Ninu", "Poste", "Affectation", "Salaire en chiffre", "Salaire en Lettre", "Durée", "Adresse"],
      ...contracts.map((contract) => [
        contract.gender,
        contract.lastName,
        contract.firstName,
        contract.nif ?? "",
        contract.ninu ?? "",
        exportWithPrepositions
          ? applySuggestionPrefix(
              genderedTitle(salaryGrid, contract.position, contract.gender),
              "position",
              positionPrefixes.get(normalizeSuggestionGrammarValue(contract.position))
            )
          : genderedTitle(salaryGrid, contract.position, contract.gender),
        exportWithPrepositions
          ? formatInstitutionAssignment(
              contract.assignment,
              institutionPrepositions,
              institutionPrefixes.get(normalizeSuggestionGrammarValue(contract.assignment))
            )
          : contract.assignment,
        contract.salaryNumber,
        numberToFrenchWords(contract.salaryNumber),
        contract.durationMonths,
        exportWithPrepositions
          ? applySuggestionPrefix(
              contract.address,
              "address",
              addressPrefixes.get(normalizeSuggestionGrammarValue(contract.address))
            )
          : contract.address
      ])
    ] satisfies ExcelCellValue[][];
  }

  async function buildExportRows() {
    const provider = getDataProvider();
    const [contracts, positions, institutions, addresses] = await Promise.all([
      provider.contracts.getByIds(selected, workspaceId),
      Promise.resolve(gridPositions(salaryGrid)),
      provider.suggestions.getInstitutions(workspaceId),
      provider.suggestions.getAddresses(workspaceId)
    ]);
    return buildExportRowsFromContracts(contracts, positions, institutions, addresses);
  }

  function copyTextWithTextarea(text: string) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  async function copyTextToClipboard(text: string) {
    if (copyTextWithTextarea(text)) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    throw new Error("Clipboard copy failed");
  }

  async function handleExportExcel() {
    if (!can("contracts.export")) return;
    if (selected.length === 0) return;
    setActionMessage(null);
    setActionError(null);
    try {
      const rows = await buildExportRows();
      const blob = createExcelWorkbookBlob("Contrats", rows);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contrats_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setActionError("Impossible d'exporter les contrats en Excel.");
    }
  }

  async function handleCopyExcelData() {
    if (!can("contracts.export")) return;
    if (selected.length === 0) return;
    setActionMessage(null);
    setActionError(null);
    try {
      const contractsById = new Map(items.map((contract) => [contract.id, contract]));
      const selectedContracts = selected
        .map((id) => contractsById.get(id))
        .filter((contract): contract is Contract => Boolean(contract));
      const rows =
        selectedContracts.length === selected.length
          ? buildExportRowsFromContracts(selectedContracts, positionsData, institutionsData, addressesData)
          : await buildExportRows();
      await copyTextToClipboard(createExcelClipboardText(rows));
      setActionMessage(`${selected.length} contrat(s) copié(s). Collez maintenant dans Excel.`);
    } catch (error) {
      console.error(error);
      setActionError("Impossible de copier les données pour Excel.");
    }
  }

  async function assignContracts(ids: string[], dossierId: string | null) {
    if (!can("dossiers.manage")) return;
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
    if (!pendingAssignIds || pendingAssignIds.length === 0) {
      return;
    }
    const ids = [...pendingAssignIds];
    setPendingAssignIds(null);
    setActiveView("contracts");
    await assignContracts(ids, dossierId);
  }

  async function handleChangeStatus(ids: string[], newStatus: ContractStatus) {
    if (!can("contracts.change_status")) return;
    if (ids.length === 0) return;
    setActionMessage(null);
    setActionError(null);
    try {
      const updatedCount = await changeContractsStatus.mutateAsync({
        workspaceId,
        contractIds: ids,
        status: newStatus
      });
      const label = getContractStatusLabel(newStatus);
      setActionMessage(`${updatedCount} contrat(s) passé(s) à l'état "${label}".${navigator.onLine ? "" : " Changement enregistré sur cet appareil ; synchronisation au retour de la connexion."}`);
    } catch (error) {
      console.error(error);
      setActionError("Impossible de modifier l'état des contrats sélectionnés.");
    }
  }

  async function handleApplyBulkDuration() {
    if (!can("contracts.edit")) return;
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
      setContextMenu(null);
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
      y: event.clientY,
      scope: selected.includes(contractId) ? "selection" : undefined
    });
    setMenuMode("main");
    setMenuView("main");
  }


  async function handleContextAssignToDossier(dossierId: string | null) {
    if (!contextMenu) return;
    const ids = contextTargetIds;
    setContextMenu(null);
    await assignContracts(ids, dossierId);
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
            : contractId === "export-trigger"
              ? 170
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
      y: Math.max(padding, y),
      scope: contractId === "selection-actions" || (mode === "main" && selected.includes(contractId)) ? "selection" : undefined
    });
    setMenuView(
      contractId === "export-trigger"
          ? "export"
          : "main"
    );
    setDossierSubmenu(null);
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
    setDossierSubmenu(null);
    setMenuMode("main");
  }

  function openTagMenu(event: React.MouseEvent, contractId: string) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const estimatedHeight = 360;
    const padding = 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    const y =
      spaceBelow < estimatedHeight
        ? rect.top - estimatedHeight - 8
        : rect.bottom + 8;

    setContextMenu({
      id: contractId,
      x: Math.min(window.innerWidth - 320, Math.max(padding, rect.left - 180)),
      y: Math.max(padding, y)
    });
    setMenuView("tags");
    setDossierSubmenu(null);
    setMenuMode("main");
    setTagSearch("");
  }

  async function handleAssignTagToContracts(contractIds: string[], tag: Tag) {
    if (!can("contracts.edit") || contractIds.length === 0) return;
    setActionMessage(null);
    setActionError(null);

    const results = await Promise.allSettled(
      contractIds.map((contractId) =>
        assignTag.mutateAsync({
          workspaceId,
          contractId,
          tagId: tag.id
        })
      )
    );
    const failureCount = results.filter((result) => result.status === "rejected").length;
    const successCount = contractIds.length - failureCount;

    if (failureCount === 0) {
      setContextMenu(null);
      setTagSearch("");
      setActionMessage(
        contractIds.length === 1
          ? `Tag « ${tag.name} » ajouté au contrat.`
          : `Tag « ${tag.name} » ajouté à ${contractIds.length} contrats.`
      );
      return;
    }

    results.forEach((result) => {
      if (result.status === "rejected") console.error(result.reason);
    });
    setActionError(
      successCount === 0
        ? "Impossible d'ajouter le tag aux contrats sélectionnés."
        : `Tag ajouté à ${successCount} contrat(s), mais ${failureCount} ajout(s) ont échoué.`
    );
  }

  async function handleCreateAndAssignTag() {
    if (
      contextTagTargetIds.length === 0 ||
      !normalizedTagSearch ||
      !can("contracts.edit")
    ) return;

    if (exactContextTag) {
      if (contextAssignedTagIds.has(exactContextTag.id)) {
        setActionError("Ce tag est déjà attribué au contrat.");
        return;
      }
      await handleAssignTagToContracts(contextTagTargetIds, exactContextTag);
      return;
    }

    setActionMessage(null);
    setActionError(null);
    try {
      const newTag = await createTag.mutateAsync({
        workspaceId,
        name: tagSearch.trim()
      });
      await handleAssignTagToContracts(contextTagTargetIds, newTag);
    } catch (error) {
      console.error(error);
      setActionError("Impossible de créer et d'ajouter le tag.");
    }
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
        borderColor: "var(--warning)",
        color: "var(--warning)",
        backgroundColor: "var(--warning-soft)"
      };
    }

    if (dossier.isEphemeral) {
      return {
        borderColor: "var(--border)",
        color: "var(--ink-muted)",
        backgroundColor: "var(--panel-muted)"
      };
    }

    return {
      borderColor: "var(--success)",
      color: "var(--success)",
      backgroundColor: "var(--success-soft)"
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

  function handleDossierMenuSelect(dossier: Dossier) {
    if (!contextMenu) return;

    void handleContextAssignToDossier(dossier.id);
    setDossierSubmenu(null);
  }

  function renderDossierMenuItem(dossier: Dossier) {
    return (
      <button
        key={dossier.id}
        type="button"
        className="context-menu-item"
        style={{ padding: "8px 10px", fontSize: "12px" }}
        onClick={() => handleDossierMenuSelect(dossier)}
      >
        <div
          className="dossier-dot"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background:
              dossier.status === "classified"
                ? "#64748b"
                : dossier.priority === "urgence"
                  ? "#f59e0b"
                  : dossier.isEphemeral
                    ? "#94a3b8"
                    : "var(--accent)"
          }}
        />
        {dossier.name}
      </button>
    );
  }

  function getContractStatusLabel(status: string): string {
    switch (status) {
      case "liste": return "Listé";
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
      case "liste":
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

  function buildAssignmentLetterHtml(contract: Contract) {
    const fullName = `${contract.lastName} ${contract.firstName}`.trim();
    const title = contract.gender === "Femme" ? "Madame" : "Monsieur";
    const nif = contract.nif ? `NIF: ${contract.nif}` : "";
    const ninu = contract.ninu ? `NINU: ${contract.ninu}` : "";
    const salary = `${formatCurrency(contract.salaryNumber)} (${numberToFrenchWords(contract.salaryNumber)})`;
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

  async function handleDeleteContract(contractId: string) {
    if (!can("contracts.delete")) return;
    if (!contractId) return;
    const confirmed = window.confirm("Supprimer ce contrat ? Cette action est irréversible.");
    if (!confirmed) return;
    setActionError(null);
    setActionMessage(null);
    try {
      await deleteContract.mutateAsync({ id: contractId, workspaceId });
      pinnedContracts.forget(contractId);
      setSelected((prev) => prev.filter((id) => id !== contractId));
      setActionMessage("Contrat supprimé.");
    } catch (error) {
      console.error(error);
      setActionError("Impossible de supprimer le contrat.");
    }
  }

  function renderPrintHistoryButton() {
    if (isMobile) return null;
    return (
      <button type="button" className="contracts-import" onClick={() => navigate("/app/contrats/historique-impressions")}>
        <span className="material-symbols-rounded icon" aria-hidden="true">receipt_long</span>
        <span>Historique d'Impressions</span>
      </button>
    );
  }

  return (
    <div className={`page-container contracts-page${activeView === "dossiers" ? " contracts-dossiers-view" : ""}`}>
      {listsQuery.isError && <p className="list-notice" role="status">Listes non actualisées : {listError(listsQuery.error)} <button className="btn btn-outline" onClick={() => void listsQuery.refetch()}>Réessayer</button></p>}
      <header className="section-header contracts-page-header">
        <div className="toolbar-unified contracts-filter-toolbar">
          <div className="contracts-controls-row">
            <div className="view-switch-unified" role="group" aria-label="Vue des contrats">
              <ContractsScopeButton
                active={activeView === "contracts"}
                showAll={showAll}
                onSelect={selectContractsScope}
              />
              <span
                className="contracts-total-badge"
                role="status"
                aria-label="Nombre de contrats"
                aria-busy={isFetching}
              >
                {data ? data.total.toLocaleString("fr-FR") : "…"}
              </span>
              <button
                className={`view-pill-unified ${activeView === "dossiers" ? "active" : ""}`}
                onClick={() => setActiveView("dossiers")}
              >
                <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: "18px" }}>folder</span>
                Dossiers
              </button>
            </div>
            {activeView === "contracts" && <>
              <div className={`search-field-unified contracts-compact-search ${query ? "has-query" : ""}`}>
                <span className="material-symbols-rounded icon" aria-hidden="true">search</span>
                <input
                  type="search"
                  className="input"
                  aria-label="Rechercher par nom, NIF ou NINU"
                  title="Rechercher par nom, NIF ou NINU"
                  placeholder="Rechercher par nom, NIF ou NINU..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                />
              </div>
              <div className="contracts-toolbar-actions" role="group" aria-label="Filtres et tri">
                <button
                  type="button"
                  className={`toolbar-action-button ${isTodayFilterActive ? "active" : ""}`}
                  aria-pressed={isTodayFilterActive}
                  onClick={() => {
                    setDateFilterDate(getTodayDateInputValue());
                    setDateFilterMode(isTodayFilterActive ? "all" : "day");
                    setPage(1);
                    setContextMenu(null);
                  }}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">today</span><span>Aujourd'hui</span>
                </button>
                <button className={`toolbar-action-button ${tagFilterId ? "active" : ""}`} onClick={(e) => handleContextFromButton(e, "tag-filter-trigger")}>
                  <span className="material-symbols-rounded">label</span><span>Tag</span>
                </button>
                <button className="toolbar-action-button" onClick={(e) => handleContextFromButton(e, "sort-trigger")}>
                  <span className="material-symbols-rounded">sort</span><span>Trier</span>
                </button>
                <button
                  className={`toolbar-action-button ${showAdvancedFilters || advancedFilterCount > 0 ? "active" : ""}`}
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  aria-expanded={showAdvancedFilters}
                  aria-controls="contract-advanced-filters"
                >
                  <span className="material-symbols-rounded">tune</span><span>Filtres</span>
                  {advancedFilterCount > 0 && <span className="contract-filter-count">{advancedFilterCount}</span>}
                </button>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="icon-btn contracts-reset-button"
                  aria-label="Réinitialiser"
                  title="Réinitialiser les filtres"
                  onClick={clearFilters}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">restart_alt</span>
                </button>
              )}
            </>}
            {activeView === "contracts" && can("contracts.create") ? (
              <button
                type="button"
                className="btn btn-primary contracts-new-button"
                aria-label="Nouveau contrat"
                title="Nouveau contrat"
                onClick={() => navigate("/app/contrats/nouveau")}
              >
                <span className="material-symbols-rounded icon" aria-hidden="true">add</span>
                <span className="contracts-new-label">Nouveau contrat</span>
              </button>
            ) : null}
          </div>
          {activeView === "contracts" && <>
            {showAdvancedFilters && (
              <div id="contract-advanced-filters" className="contracts-filter-grid">
                <div className="contracts-filter-shortcuts">
                  <div className={`toolbar-action-button contracts-fiscal-filter ${fiscalYearFilter !== currentFiscalYear ? "active" : ""}`}>
                    <span className="material-symbols-rounded" aria-hidden="true">calendar_month</span>
                    <span>{fiscalYearFilter}</span>
                    <select
                      aria-label="Exercice fiscal"
                      value={fiscalYearFilter}
                      onChange={(event) => { setFiscalYearFilter(event.target.value); setPage(1); }}
                    >
                      {getFiscalYearOptions().map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                  <button className={`toolbar-action-button ${statusFilter !== "all" ? "active" : ""}`} onClick={(e) => handleContextFromButton(e, "filter-trigger")}>
                    <span className="material-symbols-rounded">filter_list</span><span>État</span>
                  </button>
                  <button className={`toolbar-action-button ${dateFilterMode !== "all" ? "active" : ""}`} onClick={(e) => handleContextFromButton(e, "date-filter-trigger")}>
                    <span className="material-symbols-rounded">event</span><span>Date</span>
                  </button>
                  <MultiSelectDropdown
                    toolbarIcon="schedule"
                    label="Durée"
                    options={DURATION_FILTER_OPTIONS}
                    selectedValues={selectedDurations}
                    onChange={(values) => { setSelectedDurations(values); setPage(1); }}
                    placeholder="Toutes les durées"
                  />
                  <MultiSelectDropdown
                    toolbarIcon="group"
                    label="Utilisateurs"
                    options={userFilterOptions.map(option => option.id)}
                    getOptionLabel={userFilterLabel}
                    allOptionsLabel="Tous"
                    selectedValues={selectedUserIds}
                    onChange={(values) => {
                      setSelectedUserIds(values);
                      if (values.length > 0) selectContractsScope(true);
                      setPage(1);
                    }}
                    placeholder="Tous les utilisateurs"
                    searchable
                  />
                </div>
              <MultiSelectDropdown
                fullWidth
                label="Institution"
                options={linkedLocationFilters.institution.options}
                disabled={linkedLocationFilters.institution.disabled}
                displayValue={linkedLocationFilters.institution.disabled ? linkedLocationFilters.institution.values.join(", ") : undefined}
                selectedValues={linkedLocationFilters.institution.values}
                onChange={values => changeLocationFilter("institution", values)}
                placeholder="Toutes les institutions"
                searchable
              />
              <MultiSelectDropdown
                fullWidth
                label="Département"
                options={linkedLocationFilters.department.options}
                disabled={linkedLocationFilters.department.disabled}
                displayValue={linkedLocationFilters.department.disabled ? linkedLocationFilters.department.values.join(", ") : undefined}
                selectedValues={linkedLocationFilters.department.values}
                onChange={values => changeLocationFilter("department", values)}
                placeholder="Tous les départements"
              />
              <MultiSelectDropdown
                fullWidth
                label="Commune"
                options={linkedLocationFilters.commune.options}
                disabled={linkedLocationFilters.commune.disabled}
                displayValue={linkedLocationFilters.commune.disabled ? linkedLocationFilters.commune.values.join(", ") : undefined}
                selectedValues={linkedLocationFilters.commune.values}
                onChange={values => changeLocationFilter("commune", values)}
                placeholder="Toutes les communes"
                searchable
              />
              <MultiSelectDropdown
                fullWidth
                label="Fonction"
                options={positionOptions}
                selectedValues={selectedPositions}
                onChange={(values) => { setSelectedPositions(values); setPage(1); }}
                placeholder="Toutes les fonctions"
                searchable
              />
              </div>
            )}
            {hasFilterChips && (
              <div className="contracts-active-filters" aria-label="Filtres actifs">
              {selectedUserIds.length > 0 ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setSelectedUserIds([]); setPage(1); }}
                  title="Retirer le filtre utilisateurs"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>group</span>
                  Utilisateurs: {selectedUserIds.length <= 2 ? selectedUserIds.map(userFilterLabel).join(", ") : `${selectedUserIds.length} sél.`}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}
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

              {tagFilterId ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setTagFilterId(null); setPage(1); }}
                  title="Retirer le filtre tag"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>label</span>
                  Tag: {tags.find(t => t.id === tagFilterId)?.name ?? "Sélection"}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}

              {selectedAssignments.length > 0 ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setSelectedAssignments([]); setPage(1); }}
                  title="Retirer le filtre affectation"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>corporate_fare</span>
                  Affectation: {selectedAssignments.length === 1 ? selectedAssignments[0] : `${selectedAssignments.length} sél.`}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}

              {selectedDepartments.length > 0 ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setSelectedDepartments([]); setPage(1); }}
                  title="Retirer le filtre département"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>map</span>
                  Département: {selectedDepartments.length === 1 ? selectedDepartments[0] : `${selectedDepartments.length} sél.`}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}

              {selectedCommunes.length > 0 ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setSelectedCommunes([]); setPage(1); }}
                  title="Retirer le filtre commune"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>location_on</span>
                  Commune: {selectedCommunes.length === 1 ? selectedCommunes[0] : `${selectedCommunes.length} sél.`}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}

              {selectedDurations.length > 0 ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setSelectedDurations([]); setPage(1); }}
                  title="Retirer le filtre durée"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>schedule</span>
                  Durée: {selectedDurations.length <= 2 ? selectedDurations.join(", ") : `${selectedDurations.length} sél.`}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}

              {selectedPositions.length > 0 ? (
                <button
                  type="button"
                  className="badge filter-pill"
                  onClick={() => { setSelectedPositions([]); setPage(1); }}
                  title="Retirer le filtre poste"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>work</span>
                  Poste: {selectedPositions.length === 1 ? selectedPositions[0] : `${selectedPositions.length} sél.`}
                  <span className="material-symbols-rounded" style={{ fontSize: "16px", marginLeft: "4px" }}>close</span>
                </button>
              ) : null}
              </div>
            )}
          </>}
        </div>
      </header>

      {actionError ? (
        <div className="app-toast app-toast-error" role="alert">
          <span className="material-symbols-rounded">error</span>
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Fermer"><span className="material-symbols-rounded">close</span></button>
        </div>
      ) : null}
      {actionMessage ? (
        <div className="app-toast app-toast-success" role="status">
          <span className="material-symbols-rounded">check_circle</span>
          <span>{actionMessage}</span>
          <button type="button" onClick={() => setActionMessage(null)} aria-label="Fermer"><span className="material-symbols-rounded">close</span></button>
        </div>
      ) : null}

      {activeView === "dossiers" ? (
        <DossiersInlinePanel
          workspaceId={workspaceId}
          canManage={can("dossiers.manage")}
          onDossierCreated={(dossierId) => void handleDossierCreated(dossierId)}
          onViewDossier={(dossierId) => {
            clearFilters();
            setShowAll(true);
            setSelected([]);
            setDossierFilterId(dossierId);
            setActiveView("contracts");
            setPage(1);
          }}
        />
      ) : (
        <div className="card" style={{ padding: "0", border: "none", background: "transparent", boxShadow: "none" }}>


          {/* Bulk actions bar removed from here and moved to bottom as floating overlay */}

          {isLoading ? (
            <div className="empty-state">Chargement en cours…</div>
          ) : (
            <div className="contracts-list">
              {items.length === 0 ? (
                <>
                  <div className="contracts-header">
                    {can("contracts.import") ? (
                      <button type="button" className="contracts-import" aria-label="Importer" onClick={() => setImportOpen(true)}>
                        <span className="material-symbols-rounded icon">file_upload</span>
                        <span>Importer</span>
                      </button>
                    ) : null}
                    <button type="button" className="contracts-import" aria-label="Formulaire" title="Formulaire">
                      <span className="material-symbols-rounded icon">description</span>
                      <span>Formulaire</span>
                    </button>
                    {renderPrintHistoryButton()}
                  </div>
                  <div className="empty-state">Aucun contrat trouvé.</div>
                </>
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
                    {can("contracts.import") ? (
                      <button
                        type="button"
                        className={`contracts-import ${fiscalYearIsPast ? "is-past-fiscal-year" : ""}`}
                        aria-label="Importer"
                        title={fiscalYearIsPast
                          ? `Importer dans l’année fiscale passée ${fiscalYear}`
                          : `Importer dans l’année fiscale ${fiscalYear}`}
                        onClick={() => setImportOpen(true)}
                      >
                        <span className="material-symbols-rounded icon">file_upload</span>
                        <span>Importer</span>
                        {fiscalYearIsPast ? (
                          <span className="material-symbols-rounded contracts-import-warning-icon">warning</span>
                        ) : null}
                      </button>
                    ) : null}
                    <button type="button" className="contracts-import" aria-label="Formulaire" title="Formulaire">
                      <span className="material-symbols-rounded icon">description</span>
                      <span>Formulaire</span>
                    </button>
                    {renderPrintHistoryButton()}
                  </div>
                  {items.map((contract) => {
                    const displayedStatus = contract.status;
                    const hasComment = Boolean(contract.commentaire?.trim());
                    const contractFiscalYear = getContractFiscalYear(contract);
                    const mandateWarning = contractMandateWarning(contract, findContractMinister(contract, ministerRegistry));
                    const contractNif =
                      contract.nif?.trim() || contract.applicantId?.trim() || "";
                    const linkedTasks = contractNif
                      ? privateTasksByNif.get(normalizeContractNif(contractNif)) ?? []
                      : [];
                    return (
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
                        <div className="contracts-top" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%" }}>
                          <div
                            className="contracts-name has-tooltip"
                            data-tooltip={`Sexe: ${contract.gender} · Durée: ${contract.durationMonths} mois`}
                            tabIndex={0}
                            style={{ flexGrow: 1 }}
                          >
                            {contract.firstName} {contract.lastName}
                          </div>

                          <div className="contracts-top-meta" style={{ display: "flex", gap: "12px", color: "var(--ink-muted)", fontSize: "11px", marginLeft: "auto" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }} title="Poste">
                              <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>badge</span>
                              <span>{contract.position || "—"}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }} title="Lieu d'affectation">
                              <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>location_on</span>
                              <span>{contract.assignment || "—"}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }} title="Durée du contrat">
                              <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>schedule</span>
                              <span>{contract.durationMonths} mois</span>
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
                              Salaire: <strong style={salaryGridData !== undefined && salaryOutsideGrid(salaryGrid, contract.position, contract.salaryNumber) ? { color: "#dc2626" } : undefined}>{formatCurrency(contract.salaryNumber)}</strong>
                            </span>
                          </div>
                        ) : null}

                        <div className="contracts-badges" style={{ marginTop: "6px" }}>
                          {mandateWarning && <span className="badge contract-mandate-badge" role="status" title={mandateWarning} aria-label={mandateWarning}>Hors mandat</span>}
                          {contractFiscalYear !== currentFiscalYear ? (
                            <span className="contract-list-fiscal-year" title={`Année fiscale ${contractFiscalYear}`} aria-label={`Année fiscale ${contractFiscalYear}`}>
                              {contractFiscalYear}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className={`contract-pin-button ${pinnedContracts.ids.includes(contract.id) ? "is-pinned" : ""}`}
                            aria-label={`${pinnedContracts.ids.includes(contract.id) ? "Désépingler" : "Épingler"} le contrat de ${contract.firstName} ${contract.lastName}`}
                            aria-pressed={pinnedContracts.ids.includes(contract.id)}
                            title={pinnedContracts.ids.includes(contract.id) ? "Désépingler" : "Épingler"}
                            disabled={pinnedContracts.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              void pinnedContracts.toggle(contract.id).catch(error => {
                                setActionError(error instanceof Error ? error.message : "Épinglage impossible.");
                              });
                            }}
                          >
                            <span className="material-symbols-rounded" aria-hidden="true">
                              push_pin
                            </span>
                          </button>
                          <ContractSyncIndicator contract={contract} pending={pendingSync} online={syncOnline}
                            cloudEnabled={(import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase"}
                            onRetry={retryContractSync} />
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
                              aria-label={can("dossiers.manage") ? "Ajouter au dossier" : "Sans dossier"}
                              onClick={(event) => {
                                if (can("dossiers.manage")) {
                                  openDossierMenu(event, contract.id);
                                }
                              }}
                              disabled={!can("dossiers.manage")}
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>folder</span>
                              <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>add</span>
                              {getDossierLabel(contract.dossierId)}
                            </button>
                          )}
                          <button
                            type="button"
                            className={`badge has-tooltip ${getContractStatusBadgeClass(displayedStatus)}`}
                            style={{ fontSize: "11px", padding: "2px 8px" }}
                            onClick={(event) => {
                              if (displayedStatus !== "liste" && can("contracts.change_status")) {
                                handleContextFromButton(event, contract.id, "status");
                              }
                            }}
                            disabled={displayedStatus === "liste" || !can("contracts.change_status")}
                            data-tooltip={getStatusTooltip(contract)}
                            tabIndex={0}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>monitoring</span>
                            {getContractStatusLabel(displayedStatus)}
                          </button>
                          
                          {listsByContract.has(contract.id) ? (
                            <button type="button" className={`badge list-contract-badge ${listsByContract.get(contract.id)!.sealedAt ? "list-sealed" : ""}`}
                              title="Ouvrir la liste" onClick={event => { event.stopPropagation(); navigate(`/app/listes?liste=${listsByContract.get(contract.id)!.id}`); }}>
                              <span className="material-symbols-rounded">{listsByContract.get(contract.id)!.sealedAt ? "lock" : "inventory_2"}</span>
                              {listName(listsByContract.get(contract.id)!)}
                            </button>
                          ) : null}
                          {can("contracts.edit") && <button type="button" className="badge list-contract-badge"
                            title={listsByContract.get(contract.id)?.sealedAt ? "Rouvrez la liste pour déplacer ce contrat" : "Attribuer ou changer de liste"}
                            disabled={Boolean(listsByContract.get(contract.id)?.sealedAt) || listsQuery.isPending || listsQuery.isError}
                            onClick={event => { event.stopPropagation(); setListAssignmentMode("assign"); setListAssignmentIds([contract.id]); }}>
                            <span className="material-symbols-rounded">playlist_add</span>{listsByContract.has(contract.id) ? "Changer" : "Liste"}
                          </button>}
                          {contract.tags && contract.tags.length > 0 && (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginLeft: "4px" }}>
                              {contract.tags.map(tag => (
                                <TagBadge key={tag.id} tag={tag} />
                              ))}
                            </div>
                          )}
                          {can("contracts.edit") ? (
                            <button
                              type="button"
                              className="badge contract-tag-add"
                              onClick={(event) => openTagMenu(event, contract.id)}
                              aria-label={`Ajouter un tag au contrat de ${contract.firstName} ${contract.lastName}`}
                              title="Ajouter un tag"
                            >
                              <span className="material-symbols-rounded">add</span>
                              Tag
                            </button>
                          ) : null}
                        </div>

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
                          <PersonAttachmentsButton person={contract} onClick={() => setAttachmentContract(contract)} />
                          {!isMobile ? (
                            <button
                              className="icon-btn"
                              onClick={() => navigate(`/app/contrats/${contract.id}`)}
                              aria-label="Voir le contrat"
                              title="Voir"
                            >
                              <span className="material-symbols-rounded">visibility</span>
                            </button>
                          ) : null}
                          {can("contracts.edit") ? (
                            <button
                              className="icon-btn"
                              onClick={() => navigate(`/app/contrats/${contract.id}/modifier`)}
                              aria-label="Modifier le contrat"
                              title="Modifier"
                            >
                              <span className="material-symbols-rounded">edit</span>
                            </button>
                          ) : null}
                          {!isMobile && can("contracts.print") ? (
                            <button
                              className="icon-btn primary"
                              onClick={() => handlePrint([contract.id])}
                              aria-label="Imprimer le contrat"
                              title="Imprimer"
                            >
                              <span className="material-symbols-rounded">print</span>
                            </button>
                          ) : null}
                          {can("contracts.edit") ? (
                            <button
                              className={`icon-btn comment-trigger ${hasComment ? "has-comment" : ""}`}
                              onClick={() => openComment(contract.id, contract.commentaire ?? null)}
                              aria-label={hasComment ? "Voir ou modifier le commentaire" : "Ajouter un commentaire"}
                              title={hasComment ? "Voir ou modifier le commentaire" : "Ajouter un commentaire"}
                            >
                              <span className="material-symbols-rounded">chat_bubble</span>
                            </button>
                          ) : null}
                          <ContractTaskIndicator
                            tasks={linkedTasks}
                            onOpenTasks={() => navigate("/app/taches")}
                          />
                          {can("contracts.change_status") || can("dossiers.manage") || can("contracts.delete") ? (
                            <button
                              className="icon-btn"
                              onClick={(event) => handleContextFromButton(event, contract.id)}
                              aria-label="Actions autorisées"
                              title="Plus d'actions"
                            >
                              <span className="material-symbols-rounded">more_vert</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                      </div>
                    );
                  })}
                </>
              )}
              {contextMenu && (
                <div
                  ref={contextMenuRef}
                  className="context-menu contracts-context-menu"
                  aria-label={contextMenu.scope === "selection" ? `Actions sur ${selected.length} contrats sélectionnés` : "Actions du contrat"}
                  onKeyDown={event => {
                    if (event.key === "Escape") { event.preventDefault(); setContextMenu(null); return; }
                    if (event.key === "Tab") { setContextMenu(null); return; }
                    if ((event.target as HTMLElement).matches("input, textarea, select")) return;
                    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
                    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && buttons.length) {
                      event.preventDefault();
                      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
                      buttons[next].focus();
                    }
                  }}
                  style={{ 
                    top: contextMenu.y, 
                    left: contextMenu.x, 
                    width:
                      contextMenu.id === "date-filter-trigger"
                        ? "260px"
                        : menuView === "tags"
                          ? "300px"
                        : menuMode === "main"
                          ? "310px"
                          : "240px",
                    animation: "menu-in 0.15s ease-out",
                    zIndex: 1300,
                    maxWidth: "calc(100vw - 16px)",
                    maxHeight: "calc(100dvh - 16px)",
                    overflowY: "auto"
                  }}
                  role="menu"
                >
                  {menuView !== "main" && !contextMenu.id.endsWith("-trigger") && <button type="button" className="context-menu-item contract-menu-back" onClick={() => { setMenuView("main"); setDossierSubmenu(null); }}><span className="material-symbols-rounded">arrow_back</span>Retour aux actions · {contextTargetIds.length} contrat(s)</button>}
                  {contextMenu.id === "filter-trigger" ? (
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
                              setStatusFilter(st.id);
                              setContextMenu(null); setPage(1);
                            }}
                            style={{ 
                              color: (statusFilter === st.id) ? "var(--accent)" : "inherit",
                              fontWeight: (statusFilter === st.id) ? 600 : 400
                            }}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                              {(statusFilter === st.id) ? "radio_button_checked" : "radio_button_unchecked"}
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


                      </div>
                    </>
                  ) : contextMenu.id === "tag-filter-trigger" ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>Filtrer par tag</div>
                      </div>
                      <div className="context-menu-scroll" style={{ padding: "4px" }}>
                        <button
                          className="context-menu-item"
                          onClick={() => { setTagFilterId(null); setContextMenu(null); setPage(1); }}
                          style={{ color: !tagFilterId ? "var(--accent)" : "inherit", fontWeight: !tagFilterId ? 600 : 400 }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>
                            {!tagFilterId ? "radio_button_checked" : "radio_button_unchecked"}
                          </span>
                          Tous les tags
                        </button>
                        {tags.map((tag) => (
                          <button
                            key={tag.id}
                            className="context-menu-item"
                            onClick={() => {
                              setTagFilterId(tag.id);
                              setContextMenu(null);
                              setPage(1);
                            }}
                            style={{ color: tagFilterId === tag.id ? "var(--accent)" : "inherit", fontWeight: tagFilterId === tag.id ? 600 : 400 }}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "18px", color: tag.color }}>
                              {tagFilterId === tag.id ? "radio_button_checked" : "label"}
                            </span>
                            {tag.name}
                          </button>
                        ))}
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
                          { id: "name_desc", label: "Nom Z → A", icon: "sort_by_alpha" },
                          { id: "nif_asc", label: "NIF croissant", icon: "pin" },
                          { id: "nif_desc", label: "NIF décroissant", icon: "pin" }
                        ].map((s) => (
                          <button
                            key={s.id}
                            className="context-menu-item"
                            onClick={() => { setSort(s.id as ContractSort); setContextMenu(null); setPage(1); }}
                            style={{ color: sort === s.id ? "var(--accent)" : "inherit", fontWeight: sort === s.id ? 600 : 400 }}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>{s.icon}</span>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : menuView === "tags" ? (
                    <>
                      <div className="context-menu-header-main contract-tag-menu-header">
                        <div>
                          <span>Tags du contrat</span>
                          <strong>
                            {isBulkTagContext
                              ? `${contextTagTargetIds.length} contrats sélectionnés`
                              : contextContract
                              ? `${contextContract.firstName} ${contextContract.lastName}`
                              : "Contrat"}
                          </strong>
                        </div>
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            setTagSearch("");
                          }}
                          aria-label="Fermer le menu des tags"
                        >
                          <span className="material-symbols-rounded">close</span>
                        </button>
                      </div>

                      {contextContract?.tags?.length ? (
                        <div className="contract-tag-menu-assigned">
                          <span>Déjà attribués</span>
                          <div>
                            {contextContract.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <form
                        className="contract-tag-menu-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleCreateAndAssignTag();
                        }}
                      >
                        <span className="material-symbols-rounded">search</span>
                        <input
                          autoFocus
                          type="text"
                          value={tagSearch}
                          onChange={(event) => {
                            setTagSearch(event.target.value);
                            setActionError(null);
                          }}
                          placeholder="Rechercher ou créer un tag…"
                          aria-label="Rechercher ou créer un tag"
                        />
                        {tagSearch ? (
                          <button
                            type="button"
                            onClick={() => setTagSearch("")}
                            aria-label="Effacer la recherche"
                          >
                            <span className="material-symbols-rounded">close</span>
                          </button>
                        ) : null}
                      </form>

                      <div className="context-menu-scroll contract-tag-menu-options">
                        {contextTagOptions.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            className="context-menu-item"
                            disabled={assignTag.isPending || createTag.isPending}
                            onClick={() => {
                              void handleAssignTagToContracts(contextTagTargetIds, tag);
                            }}
                          >
                            <span
                              className="contract-tag-color"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span>{tag.name}</span>
                            <span className="material-symbols-rounded contract-tag-add-icon">
                              add
                            </span>
                          </button>
                        ))}

                        {normalizedTagSearch && !exactContextTag ? (
                          <button
                            type="button"
                            className="context-menu-item contract-tag-create"
                            disabled={assignTag.isPending || createTag.isPending}
                            onClick={() => void handleCreateAndAssignTag()}
                          >
                            <span className="material-symbols-rounded">
                              {createTag.isPending || assignTag.isPending
                                ? "progress_activity"
                                : "new_label"}
                            </span>
                            Créer et ajouter « {tagSearch.trim()} »
                          </button>
                        ) : exactContextTag &&
                          contextAssignedTagIds.has(exactContextTag.id) ? (
                          <div className="context-menu-empty">
                            Ce tag est déjà attribué à ce contrat.
                          </div>
                        ) : contextTagOptions.length === 0 ? (
                          <div className="context-menu-empty">
                            {tags.length === 0
                              ? "Saisissez un nom pour créer le premier tag."
                              : "Tous les tags disponibles sont déjà attribués."}
                          </div>
                        ) : null}
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
                              void handleChangeStatus(contextTargetIds, st.id as ContractStatus);
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
                    <ContractActionsMenu
                      count={contextTargetIds.length}
                      singleContractAvailable={Boolean(contextContract)}
                      documentActionsAvailable={!isMobile}
                      secondaryOnly={contextMenu.id === "selection-actions"}
                      label={contextTargetIds.length === 1 && contextContract ? `${contextContract.firstName} ${contextContract.lastName}` : undefined}
                      can={can}
                      expanded={Boolean(contextContract && isExpanded(contextContract.id))}
                      onClose={() => setContextMenu(null)}
                      onDetails={() => { if (contextContract) toggleExpanded(contextContract.id); setContextMenu(null); }}
                      onList={mode => { setListAssignmentMode(mode); setListAssignmentIds(contextTargetIds); setContextMenu(null); }}
                      onDossiers={() => setMenuView("dossiers")}
                      onNewDossier={() => { setContextMenu(null); requestCreateDossierAndAssign(contextTargetIds); }}
                      onRemoveDossier={() => void handleContextAssignToDossier(null)}
                      onStatus={() => setMenuView("status")}
                      onDuration={contextMenu.scope === "selection" ? () => { setBulkDuration(""); setMenuView("duration"); } : undefined}
                      onExport={contextMenu.scope === "selection" ? () => setMenuView("export") : undefined}
                      onTags={() => { setTagSearch(""); setMenuView("tags"); }}
                      onLetter={() => { if (contextContract) handleAssignmentLetter(contextContract); setContextMenu(null); }}
                      onDelete={() => { if (contextContract) void handleDeleteContract(contextContract.id); setContextMenu(null); }}
                      onPrint={() => { void handlePrint(contextTargetIds); setContextMenu(null); }}
                    />
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
                              void handleChangeStatus(contextTargetIds, st.id as ContractStatus);
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
                  ) : menuView === "duration" ? (
                    <form className="selection-duration-form" onSubmit={event => { event.preventDefault(); void handleApplyBulkDuration(); }}>
                      <label htmlFor="selection-duration">Durée de la sélection</label>
                      <div>
                        <input id="selection-duration" className="input" type="number" min="1" max="12" required value={bulkDuration} onChange={event => setBulkDuration(event.target.value ? Number(event.target.value) : "")} />
                        <span>mois</span>
                      </div>
                      <button className="btn btn-primary" disabled={!bulkDuration || changeContractsDuration.isPending}>Appliquer la durée</button>
                    </form>
                  ) : menuView === "export" ? (
                    <>
                      <div className="context-menu-header-main" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-muted)" }}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--ink-muted)", fontWeight: 700 }}>Export Excel</div>
                      </div>

                      <div style={{ padding: "12px", display: "grid", gap: "12px" }}>
                        <label
                          className="switch"
                          title="Ajouter les articles et prépositions dans le fichier Excel selon les règles configurées"
                          style={{ justifyContent: "space-between", gap: "10px" }}
                        >
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)" }}>
                            Prépositions
                          </span>
                          <div style={{ display: "inline-flex", alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={exportWithPrepositions}
                              onChange={(event) => setExportWithPrepositions(event.target.checked)}
                            />
                            <span className="switch-slider" />
                          </div>
                        </label>

                        <button
                          className="btn btn-secondary"
                          type="button"
                          style={{ width: "100%", justifyContent: "center" }}
                          onClick={() => {
                            setContextMenu(null);
                            void handleCopyExcelData();
                          }}
                        >
                          Copier pour Excel
                        </button>

                        <button
                          className="btn btn-primary"
                          type="button"
                          style={{ width: "100%", justifyContent: "center" }}
                          onClick={() => {
                            setContextMenu(null);
                            void handleExportExcel();
                          }}
                        >
                          Exporter
                        </button>
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
                          const ids = contextTargetIds;
                          setContextMenu(null);
                          requestCreateDossierAndAssign(ids);
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: "18px" }}>create_new_folder</span>
                        Nouveau dossier
                      </button>

                      <div className="context-menu-scroll" style={{ maxHeight: "220px", overflowY: "auto", padding: "4px", position: "relative" }}>
                        {dossiers.length === 0 ? (
                          <div className="context-menu-empty" style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "var(--ink-muted)" }}>Aucun dossier</div>
                        ) : (
                          <>
                            {dossierGroups.active.length === 0 ? (
                              <div className="context-menu-empty" style={{ padding: "10px", fontSize: "12px", color: "var(--ink-muted)" }}>
                                Aucun dossier personnel en traitement
                              </div>
                            ) : (
                              dossierGroups.active.map(renderDossierMenuItem)
                            )}

                            {dossierGroups.others.length > 0 ? (
                              <button
                                type="button"
                                className="context-menu-item"
                                style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 700 }}
                                aria-expanded={dossierSubmenu === "others"}
                                onClick={() => setDossierSubmenu((current) => current === "others" ? null : "others")}
                              >
                                <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>folder_shared</span>
                                Autres dossiers
                                <span className="material-symbols-rounded" style={{ marginLeft: "auto", fontSize: "16px", opacity: 0.55 }}>chevron_right</span>
                              </button>
                            ) : null}

                            {dossierGroups.archived.length > 0 ? (
                              <button
                                type="button"
                                className="context-menu-item"
                                style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 700 }}
                                onClick={() =>
                                  setDossierSubmenu((current) =>
                                    current === "archived" ? null : "archived"
                                  )
                                }
                              >
                                <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>inventory_2</span>
                                Dossiers archivés
                                <span className="material-symbols-rounded" style={{ marginLeft: "auto", fontSize: "16px", opacity: 0.55 }}>chevron_right</span>
                              </button>
                            ) : null}

                            {dossierGroups.classified.length > 0 ? (
                              <button
                                type="button"
                                className="context-menu-item"
                                style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 700 }}
                                onClick={() =>
                                  setDossierSubmenu((current) =>
                                    current === "classified" ? null : "classified"
                                  )
                                }
                              >
                                <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>archive</span>
                                Dossiers classés
                                <span className="material-symbols-rounded" style={{ marginLeft: "auto", fontSize: "16px", opacity: 0.55 }}>chevron_right</span>
                              </button>
                            ) : null}

                            {dossierSubmenu ? (
                              <div
                                className="context-menu dossier-submenu"
                                style={{ position: "static", width: "100%", maxHeight: "180px", overflowY: "auto", padding: "4px", boxShadow: "none" }}
                              >
                                {(dossierSubmenu === "others"
                                  ? dossierGroups.others
                                  : dossierSubmenu === "archived"
                                  ? dossierGroups.archived
                                  : dossierGroups.classified
                                ).map(renderDossierMenuItem)}
                              </div>
                            ) : null}
                          </>
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
              pageSizeOptions={CONTRACT_PAGE_SIZE_OPTIONS}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : null}
        </div>
      )}
      {listAssignmentIds && <ListAssignmentDialog contractIds={listAssignmentIds} initialMode={listAssignmentMode} onClose={() => setListAssignmentIds(null)} />}
      {/* Floating Selection Actions Bar */}
      <div className={`selection-actions-shell selection-actions-compact ${hasSelection ? "active" : ""}`}>
            <div className="selection-actions-head">
              <div className="helper-text" role="status" aria-live="polite">
                {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
              </div>
              <button
                className="icon-btn"
                style={{ border: "none", background: "transparent", width: "24px", height: "24px" }}
                type="button"
                onClick={() => { setSelected([]); setContextMenu(null); }}
                title="Tout désélectionner"
                aria-label="Tout désélectionner"
              >
                <span className="material-symbols-rounded" style={{ fontSize: "16px" }}>close</span>
              </button>
            </div>
            <div className="selection-actions-row">
              {can("contracts.edit") && <button className="btn btn-outline selection-bar-button" type="button" aria-label="Attribuer la sélection à une liste" aria-haspopup="dialog" onClick={() => { setContextMenu(null); setListAssignmentMode("assign"); setListAssignmentIds([...selected]); }}>
                <span className="material-symbols-rounded" aria-hidden="true">inventory_2</span>Listes
              </button>}
              {can("dossiers.manage") && <button className="btn btn-outline selection-bar-button" type="button" aria-label="Changer le dossier de la sélection" aria-haspopup="menu" aria-expanded={contextMenu?.id === "selection-actions" && menuView === "dossiers"} onClick={event => { handleContextFromButton(event, "selection-actions"); setMenuView("dossiers"); }}>
                <span className="material-symbols-rounded" aria-hidden="true">folder_open</span>Dossier<span className="material-symbols-rounded selection-bar-chevron" aria-hidden="true">expand_more</span>
              </button>}
              {can("contracts.change_status") && <button className="btn btn-outline selection-bar-button" type="button" aria-label="Changer l’état de la sélection" aria-haspopup="menu" aria-expanded={contextMenu?.id === "selection-actions" && menuView === "status"} onClick={event => { handleContextFromButton(event, "selection-actions"); setMenuView("status"); }}>
                <span className="material-symbols-rounded" aria-hidden="true">rule</span>État<span className="material-symbols-rounded selection-bar-chevron" aria-hidden="true">expand_more</span>
              </button>}
              {can("contracts.edit") && <button className="btn btn-outline selection-bar-button" type="button" aria-label="Ajouter un tag à la sélection" aria-haspopup="menu" aria-expanded={contextMenu?.id === "selection-actions" && menuView === "tags"} onClick={event => { handleContextFromButton(event, "selection-actions"); setTagSearch(""); setMenuView("tags"); }}>
                <span className="material-symbols-rounded" aria-hidden="true">label</span>Tags<span className="material-symbols-rounded selection-bar-chevron" aria-hidden="true">expand_more</span>
              </button>}
              {can("contracts.edit") && <form className="selection-bar-duration" onSubmit={event => { event.preventDefault(); void handleApplyBulkDuration(); }}>
                <input className="input" aria-label="Durée de la sélection en mois" type="number" min="1" max="12" required placeholder="—" value={bulkDuration} onChange={event => setBulkDuration(event.target.value ? Number(event.target.value) : "")} />
                <span>mois</span>
                <button className="icon-btn" type="submit" title="Appliquer la durée" aria-label="Appliquer la durée" disabled={!bulkDuration || changeContractsDuration.isPending}><span className="material-symbols-rounded" aria-hidden="true">check</span></button>
              </form>}
              {!isMobile && can("contracts.print") && <button className="icon-btn selection-bar-print" type="button" title="Imprimer la sélection" aria-label="Imprimer la sélection" onClick={() => { setContextMenu(null); void handlePrint(selected); }}><span className="material-symbols-rounded" aria-hidden="true">print</span></button>}
              {can("contracts.export") && <button className="btn btn-outline selection-bar-button" type="button" aria-label="Exporter la sélection" aria-haspopup="menu" aria-expanded={contextMenu?.id === "selection-actions" && menuView === "export"} onClick={event => { handleContextFromButton(event, "selection-actions"); setMenuView("export"); }}>
                <span className="material-symbols-rounded" aria-hidden="true">download</span>Export<span className="material-symbols-rounded selection-bar-chevron" aria-hidden="true">expand_more</span>
              </button>}
              <button className="btn btn-primary selection-actions-trigger" type="button" aria-label="Actions de la sélection" aria-haspopup="menu" aria-expanded={contextMenu?.id === "selection-actions" && menuView === "main"} onClick={event => {
                if (contextMenu?.id === "selection-actions" && menuView === "main") setContextMenu(null);
                else handleContextFromButton(event, "selection-actions");
              }}>
                Actions<span className="material-symbols-rounded" aria-hidden="true">expand_more</span>
              </button>
            </div>
          </div>

      {attachmentContract && <PersonAttachmentsDialog person={attachmentContract} onClose={() => setAttachmentContract(null)} />}
      <ContractCommentModal
        isOpen={Boolean(activeCommentContract)}
        contractLabel={
          activeCommentContract
            ? `${activeCommentContract.firstName} ${activeCommentContract.lastName}`
            : ""
        }
        value={
          activeCommentContract
            ? commentDraft[activeCommentContract.id] ?? activeCommentContract.commentaire ?? ""
            : ""
        }
        isSaving={updateContractComment.isPending}
        onChange={(value) => {
          if (!activeCommentContract) return;
          handleCommentInput(activeCommentContract.id, value);
        }}
        onClose={() => setCommentOpen(null)}
        onSave={() => {
          if (!activeCommentContract) return;
          saveComment(activeCommentContract.id);
        }}
      />
      <ContractsImportModal
        isOpen={importOpen}
        workspaceId={workspaceId}
        currentUserId={userId}
        currentUserName={user?.name ?? "Utilisateur connecté"}
        dossiers={dossiers}
        appUsers={appUsers}
        existingContracts={items}
        onClose={() => setImportOpen(false)}
        onImported={(count) => {
          setActionError(null);
          setActionMessage(`${count} contrat(s) importé(s).`);
          setPage(1);
        }}
      />
    </div>
  );
}
