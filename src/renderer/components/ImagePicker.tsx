import { useEffect, useState } from 'react';
import type { CollectionInfo } from '../../shared/types';
import { api, bridge, imagePath } from '../bridge';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  collection: CollectionInfo;
  /** Currently chosen images; undefined means the whole folder. */
  chosen: string[] | undefined;
  onApply(images: string[] | undefined): void;
  onClose(): void;
}

/** Thumbnails of one folder; click to pick the images a session should use. */
export function ImagePicker({ open, collection, chosen, onApply, onClose }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [draft, setDraft] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let live = true;
    setDraft(new Set(chosen ?? []));
    void api()
      .collectionImages(collection.id)
      .then((list) => live && setAll(list));
    return () => {
      live = false;
    };
    // The draft starts from the saved choice each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collection.id]);

  const toggle = (rel: string) =>
    setDraft((d) => {
      const n = new Set(d);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });

  const apply = () => {
    const picked = all.filter((r) => draft.has(r));
    onApply(picked.length === 0 || picked.length === all.length ? undefined : picked);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} wide title="Choose images" description={`From "${collection.name}". Pick one or several; nothing picked means the whole folder.`} testId="picker">
      <div className="picker-bar">
        <span className="muted small" data-testid="picker-count">
          {draft.size === 0 ? 'None picked: the whole folder' : `${draft.size} of ${all.length} picked`}
        </span>
        <span className="picker-bar-actions">
          <button type="button" className="btn ghost" data-testid="picker-all" onClick={() => setDraft(new Set(all))}>Select all</button>
          <button type="button" className="btn ghost" data-testid="picker-none" onClick={() => setDraft(new Set())}>Clear</button>
        </span>
      </div>
      <div className="picker-grid" data-testid="picker-grid">
        {all.map((rel) => (
          <button key={rel} type="button" className="pick-tile" aria-pressed={draft.has(rel)} aria-label={rel} title={rel} data-testid="pick-tile" onClick={() => toggle(rel)}>
            <img loading="lazy" decoding="async" alt="" src={bridge().fileUrl(imagePath(collection.path, rel))} />
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" data-testid="picker-done" onClick={apply}>
          {draft.size === 0 ? 'Use the whole folder' : `Use ${draft.size} image${draft.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </Dialog>
  );
}
