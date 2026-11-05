import { useMemo, useState } from 'react';
import { addDays, localDate, parseLocalDate, startOfDay } from '../../shared/dates';
import { fmtMin } from '../../shared/format';
import { Dialog } from './Dialog';
import { api } from '../bridge';
import { useStore } from '../store';

const DEFAULT_TYPES = ['Gesture', 'Figure', 'Portrait', 'Hands & feet', 'Perspective', 'Environment', 'Still life', 'Other'];
const DURATIONS = [15, 30, 45, 60, 120];

/** Add practice done outside the app (sketchbook, class, tablet). */
export function LogDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { collections, sessions, today, reload, setFlash } = useStore();
  const [off, setOff] = useState(0);
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState(45);
  const [custom, setCustom] = useState('');
  const [type, setType] = useState('');
  const [note, setNote] = useState('');

  const types = useMemo(() => {
    const set = new Set<string>(DEFAULT_TYPES);
    collections.forEach((c) => set.add(c.name));
    sessions.forEach((s) => set.add(s.type));
    return [...set];
  }, [collections, sessions]);
  const chosenType = type || types.find((t) => t === collections[0]?.name) || 'Figure';

  const day = date ? parseLocalDate(date) : addDays(startOfDay(today), -off);
  const future = day > startOfDay(today);

  async function save() {
    if (future || minutes <= 0) return;
    const started = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0);
    await api().addSession({
      date: localDate(day),
      startedAt: started.toISOString(),
      type: chosenType,
      collectionId: collections.find((c) => c.name === chosenType)?.id ?? null,
      mode: 'manual',
      seconds: minutes * 60,
      images: 0,
      source: 'manual',
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    await reload();
    setFlash(`Added ${fmtMin(minutes)} of ${chosenType.toLowerCase()}. Your week and history are updated.`);
    setNote('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log practice outside the app" description="It counts toward your week, the heatmap and recent sessions." testId="log-dialog">
      <div className="stack" role="group" aria-labelledby="lg-when">
        <div id="lg-when" className="label-strong">When</div>
        <div className="chip-row">
          {[
            [0, 'Today'],
            [1, 'Yesterday'],
            [2, '2 days ago'],
          ].map(([o, label]) => (
            <button key={o} type="button" className="chip" aria-pressed={!date && off === o} data-testid={`log-day-${o}`} onClick={() => { setOff(o as number); setDate(''); }}>
              {label}
            </button>
          ))}
          <label className="inline-field muted small">
            Date
            <input type="date" data-testid="log-date" value={date} max={localDate(today)} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="stack" role="group" aria-labelledby="lg-dur">
        <div id="lg-dur" className="label-strong">How long</div>
        <div className="chip-row">
          {DURATIONS.map((m) => (
            <button key={m} type="button" className="chip mono" aria-pressed={!custom && minutes === m} data-testid={`log-min-${m}`} onClick={() => { setMinutes(m); setCustom(''); }}>
              {fmtMin(m)}
            </button>
          ))}
          <label className="inline-field muted small">
            Custom
            <input
              type="number"
              min={1}
              max={720}
              placeholder="min"
              data-testid="log-custom"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                const n = Math.round(Number(e.target.value));
                if (n > 0) setMinutes(Math.min(n, 720));
              }}
            />
          </label>
        </div>
      </div>

      <div className="grid-2">
        <label className="field">
          <span className="label-strong">Drawing type</span>
          <select data-testid="log-type" value={chosenType} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label-strong">
            Note <span className="muted">optional</span>
          </span>
          <input type="text" placeholder="Life drawing class" data-testid="log-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" data-testid="log-save" disabled={future} onClick={() => void save()}>
          Add {fmtMin(minutes)} · {chosenType}
        </button>
      </div>
    </Dialog>
  );
}
