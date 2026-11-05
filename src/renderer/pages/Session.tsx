import { useEffect, useRef, useState } from 'react';
import { clock, fmtMin } from '../../shared/format';
import { localDate } from '../../shared/dates';
import { SessionRunner } from '../../shared/session';
import type { ActiveSession } from '../appctx';
import { api, bridge, imagePath } from '../bridge';
import { ConfirmDialog } from '../components/Confirm';
import { Dialog } from '../components/Dialog';
import { IconChevronLeft, IconNext, IconPause, IconPlay, IconPrev } from '../components/icons';
import { MODE_LABEL, useStore } from '../store';

interface Views {
  mirror: boolean;
  flip: boolean;
  gray: boolean;
  grid: number;
}
interface Result {
  saved: boolean;
  seconds: number;
  images: number;
}

const MIN_SAVE_SECONDS = 20;

function typingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}

export function Session({ active, onExit }: { active: ActiveSession; onExit(): void }) {
  const { reload, patchSettings } = useStore();
  const { setup, collection } = active;

  const runner = useRef<SessionRunner | null>(null);
  if (!runner.current) runner.current = new SessionRunner({ setup, images: active.images, clock: { now: () => Date.now() } });
  const r = runner.current;
  const startedAt = useRef(new Date());
  const finalizing = useRef(false);

  const [snap, setSnap] = useState(() => r.snapshot());
  const [views, setViews] = useState<Views>({ mirror: false, flip: false, gray: false, grid: 0 });
  const [ratio, setRatio] = useState(1.5);
  const [broken, setBroken] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [wasRunning, setWasRunning] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setSnap(r.tick()), 250);
    return () => clearInterval(id);
  }, [r]);

  async function finalize(save: boolean) {
    if (finalizing.current) return;
    finalizing.current = true;
    const s = r.finish();
    setSnap(s);
    const seconds = Math.round(s.totalElapsed);
    const images = r.imagesShown();
    if (!save) {
      onExit();
      return;
    }
    if (seconds < MIN_SAVE_SECONDS) {
      setResult({ saved: false, seconds, images });
      return;
    }
    const date = localDate(startedAt.current);
    await api().addSession({
      date,
      startedAt: startedAt.current.toISOString(),
      type: collection.name,
      collectionId: collection.id,
      mode: setup.mode,
      seconds,
      images,
      source: 'app',
    });
    await patchSettings({ lastSession: { setup, type: collection.name, date, seconds, images } });
    await reload();
    setResult({ saved: true, seconds, images });
  }

  useEffect(() => {
    if (snap.status === 'complete' && !result) void finalize(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.status]);

  // Reset per-image state when the image changes.
  useEffect(() => {
    setBroken(false);
  }, [snap.current]);

  const update = (s: typeof snap) => setSnap(s);
  const toggleView = (k: 'mirror' | 'flip' | 'gray') => setViews((v) => ({ ...v, [k]: !v[k] }));
  const toggleGrid = () => setViews((v) => ({ ...v, grid: v.grid ? 0 : 3 }));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (typingTarget(e.target) || document.querySelector('dialog[open]')) return;
      const onButton = e.target instanceof HTMLElement && e.target.tagName === 'BUTTON';
      switch (e.key) {
        case ' ':
          if (onButton) return; // let the focused button handle it
          e.preventDefault();
          update(r.toggle());
          break;
        case 'ArrowRight':
          update(r.next());
          break;
        case 'ArrowLeft':
          update(r.prev());
          break;
        case 'm':
          toggleView('mirror');
          break;
        case 'f':
          toggleView('flip');
          break;
        case 'b':
          toggleView('gray');
          break;
        case 'g':
          toggleGrid();
          break;
        case 'h':
          setFocus((v) => !v);
          break;
        case 'Escape':
          setFocus(false);
          break;
        default:
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [r]);

  function openConfirm() {
    const s = r.snapshot();
    setWasRunning(s.status === 'running');
    update(r.pause());
    setConfirm(true);
  }
  function keepDrawing() {
    setConfirm(false);
    if (wasRunning) update(r.resume());
  }

  if (result) {
    return (
      <div className="done" data-testid="session-done">
        <h1>{result.saved ? 'Session saved' : 'Too short to save'}</h1>
        <p className="muted">
          {result.saved
            ? `${fmtMin(result.seconds / 60)} of ${collection.name.toLowerCase()}${result.images > 0 ? ` · ${result.images} image${result.images === 1 ? '' : 's'}` : ''}. Added to your history.`
            : `Sessions under ${MIN_SAVE_SECONDS} seconds are not counted.`}
        </p>
        <button type="button" className="btn primary big" data-testid="done-back" onClick={onExit}>
          Back to practice
        </button>
      </div>
    );
  }

  const imgSrc = snap.current ? bridge().fileUrl(imagePath(collection.path, snap.current)) : '';
  const hasCountdown = snap.remaining !== null;
  const shownTime = hasCountdown ? snap.remaining! : snap.totalElapsed;
  const pct = hasCountdown && snap.countdownTotal ? Math.min(100, ((snap.countdownTotal - snap.remaining!) / snap.countdownTotal) * 100) : 0;
  const low = hasCountdown && snap.remaining! <= 10 && snap.status === 'running';
  const paused = snap.status === 'paused';
  const boxClass = ['stage-box', views.gray && 'gray', views.mirror && 'flip', views.flip && 'mirror-v'].filter(Boolean).join(' ');

  return (
    <div className="session" data-testid="session">
      {!focus && (
      <div className="session-head">
        <button type="button" className="btn ghost" data-testid="end-session" onClick={openConfirm}>
          <IconChevronLeft /> End session
        </button>
        <div className="muted small">
          {collection.name} · {MODE_LABEL[setup.mode]}
        </div>
      </div>
      )}

      <div className={`session-body${focus ? ' focus' : ''}`}>
        <div className="stage-wrap">
          <div className="stage" data-testid="stage">
            {imgSrc && !broken ? (
              <div className={boxClass} style={{ ['--ar' as string]: ratio, ['--gc' as string]: views.grid || 3, ['--gr' as string]: views.grid || 3 }} data-testid="stage-box">
                <img
                  key={imgSrc}
                  src={imgSrc}
                  alt="Reference image"
                  data-testid="reference-image"
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    if (w > 0 && h > 0) setRatio(w / h);
                  }}
                  onError={() => setBroken(true)}
                />
                {views.grid > 0 && <div className="grid-overlay" data-testid="grid-overlay" />}
              </div>
            ) : (
              <div className="stage-msg" role="alert">
                {broken ? "This image couldn't be loaded. Skip to the next one." : 'No image.'}
              </div>
            )}
            {focus && (
              <div className="focus-hud" data-testid="focus-hud">
                <span className={`mono${low ? ' low' : ''}`} data-testid="hud-timer">{clock(Math.ceil(shownTime))}</span>
                <button type="button" aria-label={paused ? 'Resume' : 'Pause'} data-testid="hud-play-pause" onClick={() => update(r.toggle())}>
                  {paused ? <IconPlay size={16} /> : <IconPause size={16} />}
                </button>
                <button type="button" data-testid="focus-exit" onClick={() => setFocus(false)}>Show controls <span className="kbd">h</span></button>
              </div>
            )}
          </div>
        </div>

        {!focus && (
        <aside className="rail" aria-label="Session controls">
          <div className="rail-wide">
            <div className="eyebrow" data-testid="image-counter">
              Image {snap.shown > 0 ? snap.position + 1 : 0}
              {snap.planned > 0 ? ` of ${snap.planned}` : ''}
            </div>
            <div className={`timer mono${low ? ' low' : ''}`} data-testid="timer" role="timer" aria-live="off">
              {clock(Math.ceil(shownTime))}
            </div>
            {hasCountdown && (
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="muted small" style={{ marginTop: 8 }} data-testid="elapsed">
              {hasCountdown ? `Drawn ${clock(snap.totalElapsed)}` : 'Elapsed'}
              {paused ? ' · paused' : ''}
            </div>
          </div>

          <div className="ctrls rail-wide">
            <button type="button" className="circ" aria-label="Previous image" data-testid="prev" disabled={snap.position === 0} onClick={() => update(r.prev())}>
              <IconPrev />
            </button>
            <button type="button" className="play" aria-label={paused ? 'Resume' : 'Pause'} data-testid="play-pause" onClick={() => update(r.toggle())}>
              {paused ? <IconPlay size={24} /> : <IconPause />}
            </button>
            <button type="button" className="circ" aria-label="Next image" data-testid="next" onClick={() => update(r.next())}>
              <IconNext />
            </button>
          </div>

          {hasCountdown && (
            <div className="chip-row rail-wide" style={{ justifyContent: 'center' }}>
              <button type="button" className="chip mono" data-testid="sub-15" onClick={() => update(r.addTime(-15))}>−15s</button>
              <button type="button" className="chip mono" data-testid="add-15" onClick={() => update(r.addTime(15))}>+15s</button>
              <button type="button" className="chip mono" data-testid="add-60" onClick={() => update(r.addTime(60))}>+1m</button>
            </div>
          )}

          <div className="rail-wide stack">
            <div className="label-strong">View</div>
            <div className="view-row">
              <button type="button" aria-pressed={views.mirror} data-testid="view-mirror" onClick={() => toggleView('mirror')}>Mirror <span className="kbd">m</span></button>
              <button type="button" aria-pressed={views.flip} data-testid="view-flip" onClick={() => toggleView('flip')}>Flip <span className="kbd">f</span></button>
              <button type="button" aria-pressed={views.gray} data-testid="view-gray" onClick={() => toggleView('gray')}>Greyscale <span className="kbd">b</span></button>
              <button type="button" aria-pressed={views.grid > 0} data-testid="view-grid" onClick={toggleGrid}>Grid <span className="kbd">g</span></button>
            </div>
            {views.grid > 0 && (
              <label className="inline-field muted small">
                Grid size
                <select data-testid="grid-size" value={views.grid} onChange={(e) => setViews((v) => ({ ...v, grid: Number(e.target.value) }))}>
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} × {n}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button type="button" className="btn rail-wide" data-testid="focus-toggle" onClick={() => setFocus(true)}>
            Focus on image <span className="kbd">h</span>
          </button>
          <p className="muted small rail-wide">
            <span className="kbd">space</span> pause · <span className="kbd">←</span> <span className="kbd">→</span> images
          </p>
        </aside>
        )}
      </div>

      <Dialog open={confirm} onClose={keepDrawing} title="End this session?" description="Time drawn so far can be saved to your history." testId="end-dialog">
        <div className="dialog-actions">
          <button type="button" className="btn" data-testid="end-keep" onClick={keepDrawing}>Keep drawing</button>
          <button type="button" className="btn danger" data-testid="end-discard" onClick={() => { setConfirm(false); void finalize(false); }}>Discard</button>
          <button type="button" className="btn primary" data-testid="end-save" onClick={() => { setConfirm(false); void finalize(true); }}>Save and end</button>
        </div>
      </Dialog>
    </div>
  );
}
