import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { getPinnedChoices, togglePinnedChoice } from "../../data/local/suggestionsDb";

export type AutocompleteItem = {
  id: string;
  label: string;
  sublabel?: string;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items
  const q = normalize(value);
  
  useEffect(() => {
    if (!pinCategory) return;
    const update = () => setPinnedIds(getPinnedChoices(pinCategory));
    update();
    window.addEventListener("contribution_pinned_updated", update);
    return () => window.removeEventListener("contribution_pinned_updated", update);
  }, [pinCategory]);

  const visibleItems = useMemo(() => {
    if (!open) return [];
    
    // Filter base items
    const isExactMatch = q && items.some(it => normalize(it.label) === q);
    let filtered = (q && (!showAllOnFocus || !isExactMatch))
      ? items.filter((item) => normalize(item.label).includes(q))
      : (q || showAllOnFocus ? items : []);
      
    // Handle featured item
    if (featuredItem) {
      filtered = filtered.filter(it => it.id !== featuredItem.id);
    }
    
    // Sort pinned items to top
    if (pinnedIds.length > 0) {
      filtered.sort((a, b) => {
        const aPinned = pinnedIds.includes(a.id);
        const bPinned = pinnedIds.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return 0;
      });
    }

    if (featuredItem) {
      return [featuredItem, ...filtered];
    }
    
    return filtered;
  }, [open, items, q, showAllOnFocus, featuredItem, pinnedIds]);

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

  function selectItem(item: AutocompleteItem) {
    onChange(item.label);
    onSelect?.(item);
    setOpen(false);
    setActiveIndex(-1);
    
    if (onAfterSelect) {
      setTimeout(onAfterSelect, 0);
    }
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 0 shortcut picks the featured item
      if (open && featuredItem && e.key === "0") {
        e.preventDefault();
        selectItem(featuredItem);
        return;
      }

      // Number shortcuts: 1-9 pick item
      if (open && visibleItems.length > 0) {
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
              <button
                key={`${item.id}-${idx}`}
                type="button"
                className={`autocomplete-item${idx === activeIndex ? " active" : ""}${isFeatured ? " featured" : ""}`}
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
                  {item.label}
                </span>
                
                {item.sublabel && (
                  <span className="autocomplete-item-sublabel">{item.sublabel}</span>
                )}
                
                {pinCategory && !isFeatured && (
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
