import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  getPinnedChoices,
  getRecentChoices,
  recordRecentChoice,
  togglePinnedChoice
} from "../../data/local/suggestionsDb";

export type AutocompleteItem = {
  id: string;
  label: string;
  sublabel?: string;
  /** Small context-specific adjustment applied after the standard ranking signals. */
  rankingBoost?: number;
};

type AutocompleteDisplayItem = AutocompleteItem & {
  isCustom?: boolean;
  isFeatured?: boolean;
  isRecent?: boolean;
  matchStart?: number;
  matchLength?: number;
};

type ScoredAutocompleteItem = {
  item: AutocompleteDisplayItem;
  score: number;
};

interface AutocompleteFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: AutocompleteItem) => void;
  /** Called after selection so the parent can move focus to the next field */
  onAfterSelect?: () => void;
  items: AutocompleteItem[];
  placeholder?: string;
  /** Accessible name when the field intentionally has no visible label. */
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  name?: string;
  /** Whether to show all items when the field is focused even if empty */
  showAllOnFocus?: boolean;
  /** Error styling */
  hasError?: boolean;
  /** Max shortcuts shown (Alt+1…Alt+9, then Alt+0). Defaults to 10. */
  maxShortcuts?: number;
  /** Featured item (last chosen value) to show at the top */
  featuredItem?: AutocompleteItem;
  /** Category for pinning, e.g. "address". If provided, shows pin icons. */
  pinCategory?: string;
  /** Optional blur handler for parent autosave workflows. */
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  /** Optional keydown handler from parent. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Disable internal ArrowUp/ArrowDown handling (useful for spreadsheet navigation). */
  enableArrowNavigationInMenu?: boolean;
  /** Optional row key used by spreadsheet keyboard navigation. */
  dataSheetRow?: string;
  /** Optional column index used by spreadsheet keyboard navigation. */
  dataSheetCol?: number;
}

function normalize(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function AutocompleteField({
  value,
  onChange,
  onSelect,
  onAfterSelect,
  items,
  placeholder,
  ariaLabel,
  className = "input",
  style,
  name,
  showAllOnFocus = true,
  hasError = false,
  maxShortcuts = 10,
  featuredItem,
  pinCategory,
  onBlur,
  onKeyDown,
  enableArrowNavigationInMenu = true,
  dataSheetRow,
  dataSheetCol,
}: AutocompleteFieldProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items
  const q = normalize(value);
  
  useEffect(() => {
    if (!pinCategory) return;
    const update = () => {
      setPinnedIds(getPinnedChoices(pinCategory));
      setRecentIds(getRecentChoices(pinCategory));
    };
    update();
    window.addEventListener("contribution_pinned_updated", update);
    window.addEventListener("contribution_recent_updated", update);
    return () => {
      window.removeEventListener("contribution_pinned_updated", update);
      window.removeEventListener("contribution_recent_updated", update);
    };
  }, [pinCategory]);

  const visibleItems = useMemo<AutocompleteDisplayItem[]>(() => {
    if (!open) return [];

    const featuredKey = featuredItem
      ? `${normalize(featuredItem.label)}\u0000${normalize(featuredItem.sublabel ?? "")}`
      : null;
    let hasFeaturedCandidate = false;
    const candidates: AutocompleteDisplayItem[] = items.map((item) => {
      const itemKey = `${normalize(item.label)}\u0000${normalize(item.sublabel ?? "")}`;
      const isFeatured = Boolean(featuredItem) && (
        item.id === featuredItem?.id || itemKey === featuredKey
      );
      if (isFeatured) hasFeaturedCandidate = true;
      return { ...item, isFeatured };
    });

    if (featuredItem && !hasFeaturedCandidate) {
      candidates.push({ ...featuredItem, isFeatured: true });
    }

    const exactMatch = q ? candidates.find(it => normalize(it.label) === q) : null;
    const scored = candidates
      .map((item): ScoredAutocompleteItem | null => {
        const normalizedLabel = normalize(item.label);
        const matchStart = q ? normalizedLabel.indexOf(q) : -1;
        const startsWithQuery = q ? normalizedLabel.startsWith(q) : false;
        const wordStartsWithQuery = q ? normalizedLabel.split(/[\s\-']/).some((part) => part.startsWith(q)) : false;
        const isPinned = pinnedIds.includes(item.id);
        const recentIndex = recentIds.indexOf(item.id);
        const isRecent = recentIndex >= 0;

        if (q && matchStart < 0) return null;

        let score = 0;
        if (isPinned) score += 1000;
        if (startsWithQuery) score += 500;
        else if (wordStartsWithQuery) score += 350;
        else if (q) score += 150 - Math.min(matchStart, 100);
        // A contextual probability signal must beat recency. Recency is only a
        // tie-breaker, as in spreadsheet-style autocomplete.
        if (isRecent) score += 8 - recentIndex;
        if (item.isFeatured && !q) score += 2000;
        score += item.rankingBoost ?? 0;
        score -= item.label.length / 100;

        return {
          item: {
            ...item,
            isRecent,
            matchStart,
            matchLength: q.length,
          },
          score,
        };
      })
      .filter((entry): entry is ScoredAutocompleteItem => entry !== null);

    let filtered = (q || showAllOnFocus)
      ? scored.sort((a, b) => b.score - a.score).map((entry) => entry.item)
      : [];

    const seenItems = new Set<string>();
    filtered = filtered.filter((item) => {
      // Several business choices can intentionally share a label while their
      // sublabels differ (for example one post offered at several salaries).
      const itemKey = `${normalize(item.label)}\u0000${normalize(item.sublabel ?? "")}`;
      if (seenItems.has(itemKey)) return false;
      seenItems.add(itemKey);
      return true;
    });

    const customItem: AutocompleteDisplayItem | null = q && !exactMatch
      ? {
          id: `__custom_${q}`,
          label: value.trim(),
          sublabel: "Nouvelle valeur",
          isCustom: true,
        }
      : null;
    if (q && !exactMatch) {
      return customItem ? [...filtered, customItem] : filtered;
    }

    return filtered;
  }, [open, items, q, showAllOnFocus, featuredItem, pinnedIds, recentIds, value]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const els = listRef.current.children;
      if (els[activeIndex]) {
        (els[activeIndex] as HTMLElement).scrollIntoView?.({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  function selectItem(item: AutocompleteDisplayItem) {
    onChange(item.label);
    if (pinCategory && !item.isCustom) {
      recordRecentChoice(pinCategory, item.id);
    }
    if (!item.isCustom) {
      onSelect?.(item);
    }
    setOpen(false);
    setActiveIndex(-1);
    
    setTimeout(() => {
      if (onAfterSelect) {
        onAfterSelect();
        return;
      }

      const input = inputRef.current;
      if (!input) return;

      if (dataSheetRow !== undefined && dataSheetCol !== undefined) {
        const sheetFields = Array.from(
          document.querySelectorAll<HTMLElement>("[data-sheet-row][data-sheet-col]")
        );
        const nextSheetField = sheetFields.find(
          (field) =>
            field.dataset.sheetRow === dataSheetRow &&
            Number(field.dataset.sheetCol) === dataSheetCol + 1
        );
        const currentSheetIndex = sheetFields.indexOf(input);
        const nextField = nextSheetField ?? sheetFields[currentSheetIndex + 1];
        if (nextField) {
          nextField.focus();
          return;
        }
      }

      const focusableFields = Array.from(
        (input.form ?? document).querySelectorAll<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      ).filter((field) => !(field instanceof HTMLInputElement && field.readOnly));
      const currentIndex = focusableFields.indexOf(input);
      focusableFields[currentIndex + 1]?.focus();
    }, 0);
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const shortcutCodeMatch = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
      const shortcutDigit = shortcutCodeMatch
        ? Number(shortcutCodeMatch[1])
        : /^[0-9]$/.test(e.key)
          ? Number(e.key)
          : null;
      const canUseNumericShortcuts =
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !Boolean(e.nativeEvent.isComposing);

      // The displayed order maps to Alt+1…Alt+9, then Alt+0 for item 10.
      if (canUseNumericShortcuts && open && visibleItems.length > 0 && shortcutDigit !== null) {
        const targetIndex = shortcutDigit === 0 ? 9 : shortcutDigit - 1;
        const shortcutLimit = Math.min(maxShortcuts, 10);
        if (targetIndex >= 0 && targetIndex < shortcutLimit && targetIndex < visibleItems.length) {
          e.preventDefault();
          selectItem(visibleItems[targetIndex]);
          return;
        }
      }

      if (!open) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          if (!enableArrowNavigationInMenu || visibleItems.length === 0) {
            break;
          }
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < visibleItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          if (!enableArrowNavigationInMenu || visibleItems.length === 0) {
            break;
          }
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : visibleItems.length - 1
          );
          break;
        case "Enter":
          if (visibleItems.length > 0) {
            e.preventDefault();
            const selectedIndex = activeIndex >= 0 && activeIndex < visibleItems.length
              ? activeIndex
              : 0;
            selectItem(visibleItems[selectedIndex]);
          }
          break;
        case "Escape":
          setOpen(false);
          setActiveIndex(-1);
          if (visibleItems.length > 0) {
            e.preventDefault();
          }
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, activeIndex, visibleItems, maxShortcuts, enableArrowNavigationInMenu]
  );

  function renderHighlightedLabel(item: AutocompleteDisplayItem) {
    if (!q || item.isCustom || item.matchStart === undefined || item.matchStart < 0 || !item.matchLength) {
      return item.label;
    }

    const before = item.label.slice(0, item.matchStart);
    const match = item.label.slice(item.matchStart, item.matchStart + item.matchLength);
    const after = item.label.slice(item.matchStart + item.matchLength);

    return (
      <>
        {before}
        <mark>{match}</mark>
        {after}
      </>
    );
  }

  return (
    <div
      className="autocomplete-container"
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <input
        ref={inputRef}
        type="text"
        data-sheet-row={dataSheetRow}
        data-sheet-col={dataSheetCol}
        className={className}
        value={value}
        name={name}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{
          ...style,
          ...(hasError ? { borderColor: "red" } : {}),
        }}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          handleKeyDown(event);
          if (!event.defaultPrevented) {
            onKeyDown?.(event);
          }
        }}
        onBlur={onBlur}
        autoComplete="off"
      />
      {open && visibleItems.length > 0 && (
        <div className="autocomplete-dropdown" ref={listRef}>
          {visibleItems.map((item, idx) => {
            const isFeatured = Boolean(item.isFeatured);
            const shortcutKey = idx < Math.min(maxShortcuts, 10)
              ? (idx === 9 ? 0 : idx + 1)
              : null;
            
            return (
              <div
                key={`${item.id}-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                className={`autocomplete-item${idx === activeIndex ? " active" : ""}${isFeatured ? " featured" : ""}${item.isCustom ? " custom" : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(item);
                }}
              >
                {shortcutKey !== null && (
                  <span className={`autocomplete-shortcut ${isFeatured ? "featured" : ""}`}>Alt+{shortcutKey}</span>
                )}

                <span className="autocomplete-item-label">
                  {isFeatured && <strong style={{ color: "var(--accent)", marginRight: "8px" }}>Dernier:</strong>}
                  {item.isCustom && <strong style={{ color: "var(--accent)", marginRight: "8px" }}>Utiliser:</strong>}
                  {renderHighlightedLabel(item)}
                </span>
                
                {(item.sublabel || (item.isRecent && !isFeatured && !item.isCustom)) && (
                  <span className="autocomplete-item-sublabel">
                    {item.sublabel || "Récent"}
                  </span>
                )}
                
                {pinCategory && !isFeatured && !item.isCustom && (
                  <button
                    type="button"
                    className={`autocomplete-pin-btn ${pinnedIds.includes(item.id) ? "active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePinnedChoice(pinCategory, item.id);
                    }}
                    title={pinnedIds.includes(item.id) ? "Désépingler" : "Épingler"}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                      push_pin
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
