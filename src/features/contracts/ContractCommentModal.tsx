import { useEffect, useRef } from "react";

type ContractCommentModalProps = {
  isOpen: boolean;
  contractLabel: string;
  value: string;
  isSaving?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function ContractCommentModal({
  isOpen,
  contractLabel,
  value,
  isSaving = false,
  onChange,
  onClose,
  onSave
}: ContractCommentModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="contract-comment-modal"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Commentaire du contrat ${contractLabel}`}
    >
      <div className="contract-comment-modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="contract-comment-modal-title">Commentaire · {contractLabel}</div>
        <textarea
          ref={textareaRef}
          className="textarea contract-comment-modal-textarea"
          value={value}
          placeholder="Ajouter un commentaire..."
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              onSave();
            }
          }}
        />
        <div className="contract-comment-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSaving}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={isSaving}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
