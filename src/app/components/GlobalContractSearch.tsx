import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { useNavigate } from "react-router-dom";
import type { Contract, ContractStatus } from "../../data/types";
import { useAuth } from "../../features/auth/auth";
import { useContractsList } from "../../features/contracts/contractsApi";

const RESULT_LIMIT = 12;
const SEARCH_DELAY_MS = 180;

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Brouillon",
  final: "Final",
  saisie: "Saisie",
  correction: "Correction",
  impression_partiel: "Impression partielle",
  imprime: "Imprimé",
  signe: "Signé",
  transfere: "Transféré",
  classe: "Classé"
};

function contractIdentity(contract: Contract) {
  return contract.nif || contract.ninu || "Sans identifiant";
}

export function GlobalContractSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedQuery = debouncedQuery.trim();
  const { data, isFetching, isError } = useContractsList(
    {
      workspaceId: user?.workspaceId ?? "",
      query: normalizedQuery || undefined,
      sort: "createdAt_desc",
      page: 1,
      pageSize: RESULT_LIMIT
    },
    { enabled: isOpen && Boolean(user?.workspaceId) && Boolean(normalizedQuery) }
  );
  const results = useMemo(() => data?.items ?? [], [data?.items]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "f") {
        return;
      }
      event.preventDefault();
      setIsOpen(true);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
  };

  const openContract = (contract: Contract) => {
    close();
    navigate(`/app/contrats/${contract.id}`);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openContract(results[Math.min(activeIndex, results.length - 1)]);
    }
  };

  if (!isOpen) return null;

  const hasQuery = Boolean(query.trim());
  const waitingForDebounce = query.trim() !== normalizedQuery;

  return (
    <div className="global-contract-search-layer" role="presentation" onMouseDown={close}>
      <section
        className="global-contract-search"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide de contrats"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="global-contract-search-input-row">
          <span className="material-symbols-rounded" aria-hidden="true">search</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Nom, NIF, NINU, poste, affectation ou année fiscale…"
            aria-label="Rechercher un contrat"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="global-contract-search-results"
            aria-activedescendant={results[activeIndex] ? `global-contract-result-${results[activeIndex].id}` : undefined}
            autoComplete="off"
          />
          {(isFetching || waitingForDebounce) && hasQuery ? (
            <span className="material-symbols-rounded global-contract-search-spinner" aria-label="Recherche en cours">progress_activity</span>
          ) : null}
          <button type="button" className="global-contract-search-close" onClick={close} aria-label="Fermer la recherche">
            <span className="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>

        <div id="global-contract-search-results" className="global-contract-search-results" role="listbox">
          {!hasQuery ? (
            <div className="global-contract-search-help">
              <span className="material-symbols-rounded" aria-hidden="true">manage_search</span>
              <p>Recherchez dans tous les contrats par identité, fonction, affectation ou année fiscale.</p>
            </div>
          ) : isError ? (
            <div className="global-contract-search-state" role="alert">La recherche est momentanément indisponible.</div>
          ) : !waitingForDebounce && !isFetching && results.length === 0 ? (
            <div className="global-contract-search-state">Aucun contrat trouvé pour « {query.trim()} ».</div>
          ) : (
            results.map((contract, index) => (
              <button
                key={contract.id}
                id={`global-contract-result-${contract.id}`}
                type="button"
                className={`global-contract-search-result${index === activeIndex ? " is-active" : ""}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openContract(contract)}
              >
                <span className="global-contract-search-result-icon material-symbols-rounded" aria-hidden="true">description</span>
                <span className="global-contract-search-result-content">
                  <strong>{contract.firstName} {contract.lastName}</strong>
                  <span>{contractIdentity(contract)} · {contract.position || "Fonction non renseignée"}</span>
                  <span>{contract.assignment || "Affectation non renseignée"}{contract.annee_fiscale ? ` · ${contract.annee_fiscale}` : ""}</span>
                </span>
                <span className="global-contract-search-result-side">
                  <span className="global-contract-search-status">{STATUS_LABELS[contract.status]}</span>
                  <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                </span>
              </button>
            ))
          )}
        </div>

        <footer className="global-contract-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
          <span><kbd>Entrée</kbd> ouvrir</span>
          <span><kbd>Échap</kbd> fermer</span>
          {hasQuery && data ? <strong>{data.total} résultat{data.total !== 1 ? "s" : ""}</strong> : null}
        </footer>
      </section>
    </div>
  );
}
