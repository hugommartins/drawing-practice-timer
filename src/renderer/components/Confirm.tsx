import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

export function ConfirmDialog(p: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(): void;
  onClose(): void;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <Dialog open={p.open} onClose={p.onClose} title={p.title} {...(p.description ? { description: p.description } : {})} {...(p.testId ? { testId: p.testId } : {})}>
      {p.children}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={p.onClose}>Cancel</button>
        <button type="button" className={`btn ${p.danger ? 'danger' : 'primary'}`} data-testid="confirm-yes" onClick={p.onConfirm}>
          {p.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export function PromptDialog(p: { open: boolean; title: string; description?: string; initial: string; confirmLabel: string; onSubmit(value: string): void; onClose(): void }) {
  const [value, setValue] = useState(p.initial);
  return (
    <Dialog open={p.open} onClose={p.onClose} title={p.title} {...(p.description ? { description: p.description } : {})} testId="prompt-dialog">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) p.onSubmit(value.trim());
        }}
      >
        <input type="text" aria-label={p.title} data-testid="prompt-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={p.onClose}>Cancel</button>
          <button type="submit" className="btn primary" data-testid="prompt-save" disabled={!value.trim()}>{p.confirmLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}
