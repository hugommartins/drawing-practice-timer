import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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

const GAP = 8;
const MIN_TILE = 104;
const PAD = 2; // matches .picker-grid padding
const OVERSCAN_ROWS = 3;

/**
 * Only the rows in view (plus a few either side) are rendered, with explicit pixel positions.
 * A folder of 50,000 images used to mean 50,000 buttons and images in the page; now it is a few dozen,
 * and no layout depends on the browser sizing a huge grid.
 */
function useWindowedGrid(count: number) {
  // A callback ref held in state: the grid only exists while the dialog is open, so the measuring
  // effect must run when the element appears, not when the component mounts.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    if (!el) return;
    setTop(el.scrollTop);
    const measure = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const onScroll = useCallback(() => {
    if (el) setTop(el.scrollTop);
  }, [el]);

  return useMemo(() => {
    const inner = Math.max(0, box.w - PAD * 2);
    const cols = Math.max(1, Math.floor((inner + GAP) / (MIN_TILE + GAP)));
    const size = Math.max(MIN_TILE, Math.floor((inner - GAP * (cols - 1)) / cols));
    const pitch = size + GAP;
    const rows = Math.ceil(count / cols);
    const first = Math.max(0, Math.floor(top / pitch) - OVERSCAN_ROWS);
    const last = Math.min(rows - 1, Math.ceil((top + box.h) / pitch) + OVERSCAN_ROWS);
    return { ref: setEl, onScroll, cols, size, pitch, height: Math.max(0, rows * pitch - GAP), from: first * cols, to: Math.min(count, (last + 1) * cols) };
  }, [box.w, box.h, top, count, onScroll]);
}

/** Thumbnails of one folder; click to pick the images a session should use. */
export function ImagePicker({ open, collection, chosen, onApply, onClose }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const grid = useWindowedGrid(all.length);

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
      <div className="picker-grid" data-testid="picker-grid" ref={grid.ref} onScroll={grid.onScroll}>
        <div className="picker-grid-inner" style={{ height: grid.height }}>
          {all.slice(grid.from, grid.to).map((rel, k) => {
            const i = grid.from + k;
            return (
              <button
                key={rel}
                type="button"
                className="pick-tile"
                aria-pressed={draft.has(rel)}
                aria-label={rel}
                title={rel}
                data-testid="pick-tile"
                style={{ left: (i % grid.cols) * (grid.size + GAP), top: Math.floor(i / grid.cols) * grid.pitch, width: grid.size, height: grid.size }}
                onClick={() => toggle(rel)}
              >
                <img loading="lazy" decoding="async" alt="" src={bridge().thumbUrl(imagePath(collection.path, rel))} />
              </button>
            );
          })}
        </div>
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
