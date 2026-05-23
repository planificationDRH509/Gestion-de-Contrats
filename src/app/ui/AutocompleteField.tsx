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
};

type AutocompleteDisplayItem = AutocompleteItem & {
  isCustom?: boolean;
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
  className?: string;
  style?: React.CSSProperties;
  name?: string;
  /** Whether to show all items when the field is focused even if empty */
  showAllOnFocus?: boolean;
  /** Error styling */
  hasError?: boolean;
  /** Max shortcuts shown (1-9). Defaults to 9. */
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
  className = "input",
  style,
  name,
  showAllOnFocus = true,
  hasError = false,
  maxShortcuts = 9,
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

    const exactMatch = q ? items.find(it => normalize(it.label) === q) : null;
    const scored = items
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
        if (isRecent) score += 80 - recentIndex;
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

    const seenLabels = new Set<string>();
    filtered = filtered.filter((item) => {
      const labelKey = normalize(item.label);
      if (seenLabels.has(labelKey)) return false;
      seenLabels.add(labelKey);
      return true;
    });

    if (featuredItem) {
      const featuredLabel = normalize(featuredItem.label);
      filtered = filtered.filter(it => it.id !== featuredItem.id && normalize(it.label) !== featuredLabel);
    }

    const customItem: AutocompleteDisplayItem | null = q && !exactMatch
      ? {
          id: `__custom_${q}`,
          label: value.trim(),
          sublabel: "Nouvelle valeur",
          isCustom: true,
        }
      : null;
    const baseItems = featuredItem ? [featuredItem, ...filtered] : filtered;
    if (q && !exactMatch) {
      return customItem ? [...baseItems, customItem] : baseItems;
    }

    return baseItems;
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
        (els[activeIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
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
    
    if (onAfterSelect) {
      setTimeout(onAfterSelect, 0);
    }
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isInputFocused = document.activeElement === inputRef.current;
      const hasShortcutModifier = e.altKey || e.ctrlKey || e.metaKey;
      const canUseNumericShortcuts =
        isInputFocused && !hasShortcutModifier && !Boolean(e.nativeEvent.isComposing);

      // 0 shortcut picks the featured item
      if (canUseNumericShortcuts && open && featuredItem && e.key === "0") {
        e.preventDefault();
        selectItem(featuredItem);
        return;
      }

      // Number shortcuts: 1-9 pick item
      if (canUseNumericShortcuts && open && visibleItems.length > 0) {
        const digit = parseInt(e.key, 10);
        if (!isNaN(digit) && digit >= 1 && digit <= maxShortcuts) {
          const offset = featuredItem ? 0 : -1;
          const targetIndex = digit + offset;
          if (targetIndex >= 0 && targetIndex < visibleItems.length) {
            e.preventDefault();
            selectItem(visibleItems[targetIndex]);
            return;
          }
        }
      }

      if (!open) {
        if (enableArrowNavigationInMenu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          setOpen(true);
          setActiveIndex(0);
          return;
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          if (!enableArrowNavigationInMenu) {
            break;
          }
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < visibleItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          if (!enableArrowNavigationInMenu) {
            break;
          }
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : visibleItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < visibleItems.length) {
            selectItem(visibleItems[activeIndex]);
          } else if (q) {
            setOpen(false);
            setActiveIndex(-1);
            if (onAfterSelect) {
              setTimeout(onAfterSelect, 0);
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, activeIndex, visibleItems, maxShortcuts, featuredItem, enableArrowNavigationInMenu]
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
    <div className="autocomplete-container" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        data-sheet-row={dataSheetRow}
        data-sheet-col={dataSheetCol}
        className={className}
        value={value}
        name={name}
        placeholder={placeholder}
        style={{
          ...style,
          ...(hasError ? { borderColor: "red" } : {}),
        }}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(-1);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          handleKeyDown(event);
          onKeyDown?.(event);
        }}
        onBlur={onBlur}
        autoComplete="off"
      />
      {open && visibleItems.length > 0 && (
        <div className="autocomplete-dropdown" ref={listRef}>
          {visibleItems.map((item, idx) => {
            const isFeatured = featuredItem && item.id === featuredItem.id;
            let shortcutKey = null;
            if (isFeatured) {
              shortcutKey = 0;
            } else {
              const offset = featuredItem ? 0 : 1;
              const computedShortcut = idx + offset;
              if (computedShortcut <= maxShortcuts) {
                shortcutKey = computedShortcut;
              }
            }
            
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
                  <span className={`autocomplete-shortcut ${isFeatured ? "featured" : ""}`}>{shortcutKey}</span>
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
