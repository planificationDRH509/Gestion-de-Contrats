import { ReactNode, useEffect, useId, useRef } from "react";

export function ListDialog({ title, children, busy = false, wide = false, onClose }: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  wide?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return <dialog ref={ref} className={`lists-dialog${wide ? " lists-dialog-wide" : ""}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="lists-dialog-heading"><h2 id={titleId}>{title}</h2>
      <button type="button" className="lists-icon-button" aria-label="Fermer" disabled={busy} onClick={onClose}><ListIcon name="close" /></button>
    </header>
    {children}
  </dialog>;
}

export function ListIcon({ name }: { name: string }) {
  return <span className="material-symbols-rounded" aria-hidden="true">{name}</span>;
}
