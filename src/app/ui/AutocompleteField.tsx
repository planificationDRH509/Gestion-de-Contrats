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
    let filtered = q
      ? items.filter((item) => normalize(item.label).includes(q))
      : (showAllOnFocus ? items : []);
      
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

      // Number shortcuts: 1-9 pick item (starting from the second one if we consider 1-9 indices)
      // Actually, if featuredItem is at index 0, 1 picks index 1.
      if (open && visibleItems.length > 0) {
        const digit = parseInt(e.key, 10);
        if (!isNaN(digit) && digit >= 1 && digit <= Math.min(maxShortcuts, visibleItems.length)) {
          // If we have a featured item at idx 0, then 1 refers to idx 1?
          // No, usually 1 refers to the first visible thing.
          // Let's stick to: 1 picks index 0, 2 picks index 1...
          e.preventDefault();
          selectItem(visibleItems[digit - 1]);
          return;
        }

        // TAB picks the first item (featured or not)
        if (e.key === "Tab" && visibleItems.length > 0) {
          e.preventDefault();
          selectItem(visibleItems[0]);
          return;
        }
      }

      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setOpen(true);
          setActiveIndex(0);
          return;
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < visibleItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
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
    [open, activeIndex, visibleItems, maxShortcuts, featuredItem]
  );

  return (
    <div className="autocomplete-container" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
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
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && visibleItems.length > 0 && (
        <div className="autocomplete-dropdown" ref={listRef}>
          {visibleItems.map((item, idx) => {
            const isFeatured = featuredItem && item.id === featuredItem.id;
            // Digital shortcuts for first few items
            const shortcutKey = idx < maxShortcuts ? idx + 1 : null;
            
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
                {isFeatured ? (
                  <span className="autocomplete-shortcut featured">Tab</span>
                ) : shortcutKey !== null ? (
                  <span className="autocomplete-shortcut">{shortcutKey}</span>
                ) : null}

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
