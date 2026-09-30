import { ReactNode, useEffect, useRef } from "react";

export function DossierDialog({ title, children, onClose, busy = false, drawer = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={ref} className={`dossiers-dialog${drawer ? " dossiers-drawer" : ""}`}
    aria-labelledby="dossiers-dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="dossiers-dialog-header">
      <h2 id="dossiers-dialog-title">{title}</h2>
      <button type="button" className="dossiers-icon-button" aria-label="Fermer" disabled={busy} onClick={onClose}>
        <span className="material-symbols-rounded" aria-hidden="true">close</span>
      </button>
    </header>
    {children}
  </dialog>;
}
