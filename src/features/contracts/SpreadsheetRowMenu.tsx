import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type RowAction = { icon: string; label: string; onClick: () => void; danger?: boolean };

export function SpreadsheetRowMenu({ rowKey, hasComment, actions, children }: {
  rowKey: string;
  hasComment?: boolean;
  actions: RowAction[];
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `sheet-row-menu-${rowKey}`;

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current!.getBoundingClientRect();
    const menu = menuRef.current!.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(trigger.left, window.innerWidth - menu.width - 8)),
      top: trigger.bottom + menu.height + 4 <= window.innerHeight
        ? trigger.bottom + 4
        : Math.max(8, trigger.top - menu.height - 4)
    });
    menuRef.current!.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return <div className="contracts-sheet-menu-cell">
    <button type="button" ref={triggerRef} className={`icon-btn contracts-sheet-menu-trigger${hasComment ? " has-comment" : ""}`}
      aria-label="Actions de la ligne" title="Actions de la ligne" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onMouseDown={event => event.preventDefault()} onClick={() => setOpen(value => !value)}>
      <span className="material-symbols-rounded" aria-hidden="true">more_vert</span>
    </button>
    {open && createPortal(<div ref={menuRef} id={menuId} role="menu" aria-label="Actions de la ligne"
      className="contracts-sheet-row-menu" style={position}
      onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        } else if (event.key === "Tab") setOpen(false);
      }}>
      {actions.map(action => <button key={action.label} type="button" role="menuitem"
        className={`contracts-sheet-row-menu-item${action.danger ? " is-danger" : ""}`} onClick={action.onClick}>
        <span className="material-symbols-rounded" aria-hidden="true">{action.icon}</span>{action.label}
      </button>)}
      {children}
    </div>, document.body)}
  </div>;
}
