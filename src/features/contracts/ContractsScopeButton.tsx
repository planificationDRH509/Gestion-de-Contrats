import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPTIONS = [
  { showAll: false, label: "Mes contrats" },
  { showAll: true, label: "Tous les contrats" }
];

export function ContractsScopeButton({ active, showAll, onSelect }: {
  active: boolean;
  showAll: boolean;
  onSelect: (showAll: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(trigger.left, window.innerWidth - menu.width - 8)),
      top: trigger.bottom + 4
    });
    menuRef.current.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (event: MouseEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) close();
    };
    const scroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={`view-pill-unified ${active ? "active" : ""}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: "18px" }}>description</span>
      {showAll ? "Tous les contrats" : "Mes contrats"}
      <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: "16px" }}>expand_more</span>
    </button>
    {open && createPortal(
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label="Vue des contrats"
        className="context-menu contracts-scope-menu"
        style={position}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null) && event.relatedTarget !== triggerRef.current) setOpen(false);
        }}
        onKeyDown={event => {
          if (event.key === "Escape" || event.key === "Tab") {
            if (event.key === "Escape") event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
            return;
          }
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }
        }}
      >
        {OPTIONS.map(option => <button
          key={option.label}
          type="button"
          role="menuitemradio"
          aria-checked={showAll === option.showAll}
          className="context-menu-item"
          onClick={() => {
            onSelect(option.showAll);
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >
          <span>{option.label}</span>
          {showAll === option.showAll && <span className="material-symbols-rounded" aria-hidden="true">check</span>}
        </button>)}
      </div>, document.body
    )}
  </>;
}
