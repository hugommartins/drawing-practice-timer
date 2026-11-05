import { useMemo, useState } from 'react';
import { fmtMin, fmtSec, parseDuration } from '../../shared/format';
import { relativeDay } from '../../shared/dates';
import { imagesToDraw } from '../../shared/pick';
import { minutesByDate, pastYear, tally } from '../../shared/stats';
import { startOfWeek } from '../../shared/dates';
import type { SetupConfig, TimerMode } from '../../shared/types';
import { useApp } from '../appctx';
import { useLinkFolder } from '../actions';
import { api } from '../bridge';
import { Flash } from '../components/Flash';
import { ImagePicker } from '../components/ImagePicker';
import { IconFolder, IconPlay } from '../components/icons';
import { LogDialog } from '../components/LogDialog';
import { MODE_LABEL, useStore } from '../store';

const MODES: TimerMode[] = ['per-image', 'whole', 'none'];
const PER_IMAGE = [30, 60, 120, 300, 600];
const WHOLE = [600, 1200, 1800, 3600, 7200];
const COUNTS = [10, 20, 30, 50, 0];

export function Practice() {
  const { collections, sessions, settings, today, patchSettings } = useStore();
  const { startSession } = useApp();
  const link = useLinkFolder();
  const [logOpen, setLogOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setup = settings.setup;
  const byDate = useMemo(() => minutesByDate(sessions), [sessions]);
  const week = useMemo(() => tally(byDate, startOfWeek(today), today), [byDate, today]);
  const year = useMemo(() => pastYear(byDate, today), [byDate, today]);
  const todayMin = byDate.get(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`) ?? 0;

  const selected = collections.find((c) => c.id === setup.collectionId) ?? collections.find((c) => c.reachable && c.count > 0) ?? collections[0] ?? null;
  const durations = setup.mode === 'whole' ? WHOLE : PER_IMAGE;
  const duration = setup.mode === 'whole' ? setup.totalSec : setup.perImageSec;
  const durKey = setup.mode === 'whole' ? 'totalSec' : 'perImageSec';

  const blocker = !selected
    ? ''
    : !selected.reachable
      ? `The folder for "${selected.name}" can't be found. Change its folder in the Library.`
      : selected.count === 0
        ? `"${selected.name}" has no images. Add some, then rescan it in the Library.`
        : '';

  const set = (patch: Partial<SetupConfig>) => void patchSettings({ setup: { ...setup, ...patch } });

  async function begin(cfg: SetupConfig, id: string | null) {
    const col = collections.find((c) => c.id === id);
    if (!col) return;
    setBusy(true);
    setError('');
    try {
      const all = await api().collectionImages(col.id);
      if (all.length === 0) {
        setError(`"${col.name}" has no images right now.`);
        return;
      }
      const images = imagesToDraw(all, cfg.images);
      if (images.length === 0) {
        setError(`None of the images you chose are in "${col.name}" any more. Choose again or use the whole folder.`);
        return;
      }
      startSession({ setup: { ...cfg, collectionId: col.id }, collection: col, images });
    } finally {
      setBusy(false);
    }
  }

  const last = settings.lastSession;
  const lastCollection = last ? collections.find((c) => c.id === last.setup.collectionId) : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Practice</h1>
          <p className="muted">{todayMin > 0 ? `${fmtMin(todayMin)} drawn today.` : 'Nothing drawn yet today.'}</p>
        </div>
        <button type="button" className="btn" data-testid="log-open" onClick={() => setLogOpen(true)}>
          Log practice outside the app
        </button>
      </div>

      <Flash />

      <div className="stats">
        <div className="stat" data-testid="stat-week">
          <div className="eyebrow">This week</div>
          <div className="v mono">{fmtMin(week.minutes)}</div>
          <div className="s">{week.days} day{week.days === 1 ? '' : 's'} practiced</div>
        </div>
        <div className="stat" data-testid="stat-year">
          <div className="eyebrow">Past year</div>
          <div className="v mono">{year.days} days</div>
          <div className="s">{Math.round(year.minutes / 60)} hours drawn</div>
        </div>
        <div className="stat" data-testid="stat-library">
          <div className="eyebrow">Library</div>
          <div className="v mono">{collections.reduce((n, c) => n + (c.reachable ? c.count : 0), 0)}</div>
          <div className="s">images in {collections.length} folder{collections.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {collections.length === 0 ? (
        <section className="card empty" data-testid="empty-practice">
          <div className="art"><IconFolder size={44} plus /></div>
          <h2>Link a reference folder to start</h2>
          <p className="muted">Point Plchldr at a folder of images on this computer. The folder name becomes the drawing type, like "Figure" or "Hands", and every session is tracked against it.</p>
          <button type="button" className="btn primary big" data-testid="link-folder-cta" onClick={() => void link()}>
            Link a folder
          </button>
        </section>
      ) : (
        <div className="practice-grid">
          <section className="card" aria-labelledby="new-session">
            <div className="card-head">
              <h2 id="new-session">New session</h2>
            </div>

            <div className="setup-row">
              <div className="label-strong" id="lbl-timer">Timer</div>
              <div className="seg" role="radiogroup" aria-labelledby="lbl-timer">
                {MODES.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={setup.mode === m} data-testid={`setup-mode-${m}`} onClick={() => set({ mode: m })}>
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
              {setup.mode === 'none' && <p className="muted small">No countdown. Move on when you're ready; time still counts.</p>}
            </div>

            {setup.mode !== 'none' && (
              <div className="setup-row">
                <div className="label-strong" id="lbl-dur">{setup.mode === 'whole' ? 'Session length' : 'Time per image'}</div>
                <div className="chip-row" role="group" aria-labelledby="lbl-dur">
                  {durations.map((s) => (
                    <button key={s} type="button" className="chip mono" aria-pressed={duration === s} data-testid={`dur-${s}`} onClick={() => { set({ [durKey]: s }); setCustom(''); }}>
                      {fmtSec(s).replace(' min', ' min')}
                    </button>
                  ))}
                  <label className="custom-dur muted small">
                    Custom
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="min or m:ss"
                      aria-label="Custom duration"
                      data-testid="dur-custom"
                      value={custom}
                      onChange={(e) => {
                        setCustom(e.target.value);
                        const s = parseDuration(e.target.value);
                        if (s) set({ [durKey]: s });
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            {setup.mode === 'per-image' && (
              <div className="setup-row">
                <div className="label-strong" id="lbl-count">Images</div>
                <div className="chip-row" role="group" aria-labelledby="lbl-count">
                  {COUNTS.map((n) => (
                    <button key={n} type="button" className="chip mono" aria-pressed={setup.count === n} data-testid={`count-${n}`} onClick={() => set({ count: n })}>
                      {n === 0 ? 'Until I stop' : n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="setup-row">
              <label className="field">
                <span className="label-strong">References</span>
                <select
                  data-testid="ref-select"
                  value={selected?.id ?? ''}
                  onChange={(e) => set({ collectionId: e.target.value, images: undefined })}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.reachable ? `${c.count} images` : 'folder missing'}
                    </option>
                  ))}
                </select>
              </label>
              {selected && !blocker && (
                <div className="pick-row">
                  <span className="muted small" data-testid="pick-summary">
                    {setup.images?.length ? `${setup.images.length} chosen image${setup.images.length === 1 ? '' : 's'}` : `All ${selected.count} images`}
                  </span>
                  <button type="button" className="btn" data-testid="pick-open" onClick={() => setPickOpen(true)}>Choose images…</button>
                  {setup.images?.length ? <button type="button" className="btn ghost" data-testid="pick-clear" onClick={() => set({ images: undefined })}>Use whole folder</button> : null}
                </div>
              )}
              {blocker && <p className="hint warn" role="alert" data-testid="start-blocker">{blocker}</p>}
              {error && <p className="hint warn" role="alert">{error}</p>}
            </div>

            <button
              type="button"
              className="btn primary big"
              data-testid="start-session"
              disabled={!selected || !!blocker || busy}
              onClick={() => void begin(setup, selected?.id ?? null)}
              style={{ width: '100%' }}
            >
              <IconPlay /> Start session
            </button>
          </section>

          <div className="side-stack">
            <section className="card" aria-labelledby="last-title">
              <div className="card-head">
                <h2 id="last-title">Last session</h2>
              </div>
              {last ? (
                <div className="stack" data-testid="last-session">
                  <div>
                    <strong>{last.type}</strong>
                    <div className="muted small">
                      {relativeDay(last.date, today)} · {fmtMin(last.seconds / 60)} · {MODE_LABEL[last.setup.mode].toLowerCase()}
                      {last.images > 0 ? ` · ${last.images} image${last.images === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <button type="button" className="btn" data-testid="last-session-repeat" disabled={!lastCollection || !lastCollection.reachable || busy} onClick={() => void begin(last.setup, last.setup.collectionId)}>
                    Repeat this setup
                  </button>
                  {!lastCollection && <p className="muted small">That folder is no longer linked.</p>}
                </div>
              ) : (
                <p className="muted">Your first session will show up here, so you can repeat it in one click.</p>
              )}
            </section>
          </div>
        </div>
      )}

      {selected && selected.reachable && selected.count > 0 && (
        <ImagePicker open={pickOpen} collection={selected} chosen={setup.images} onApply={(images) => set({ images })} onClose={() => setPickOpen(false)} />
      )}
      <LogDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </>
  );
}
