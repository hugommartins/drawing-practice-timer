import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconClose } from './icons';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  onClose(): void;
  children: ReactNode;
  testId?: string;
}

/** Native <dialog>: gives focus trapping, Esc to close and a backdrop for free. */
export function Dialog({ open, title, description, onClose, children, testId }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      data-testid={testId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      {open && (
        <div className="dialog-body">
          <div className="dialog-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p className="muted small">{description}</p>}
            </div>
            <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}>
              <IconClose />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
