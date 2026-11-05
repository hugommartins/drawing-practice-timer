import { useMemo, useState } from 'react';
import { fmtMin } from '../../shared/format';
import { parseLocalDate, relativeDay } from '../../shared/dates';
import { byType, heatmapRows, insights, minutesByDate, rangeBounds, sessionMinutes, tally, yearsWithData, type HeatRange } from '../../shared/stats';
import type { SessionRecord } from '../../shared/types';
import { api } from '../bridge';
import { ConfirmDialog } from '../components/Confirm';
import { Heatmap, Legend } from '../components/Heatmap';
import { useStore } from '../store';

export function History() {
  const { sessions, today, reload } = useStore();
  const [range, setRange] = useState<HeatRange>('past');
  const [deleting, setDeleting] = useState<SessionRecord | null>(null);

  const byDate = useMemo(() => minutesByDate(sessions), [sessions]);
  const years = useMemo(() => yearsWithData(sessions, today), [sessions, today]);
  const rows = useMemo(() => heatmapRows(byDate, range, today), [byDate, range, today]);
  const ins = useMemo(() => insights(byDate, range, today), [byDate, range, today]);
  const total = useMemo(() => {
    const { from, to } = rangeBounds(range, today);
    return tally(byDate, from, to);
  }, [byDate, range, today]);
  const types = useMemo(() => byType(sessions, today, 30), [sessions, today]);
  const recent = useMemo(() => [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 12), [sessions]);
  const maxType = types[0]?.minutes ?? 1;
  const rangeLabel = range === 'past' ? 'the past year' : String(range);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>History</h1>
          <p className="muted">Every day you draw adds a dot.</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat" data-testid="hist-days">
          <div className="eyebrow">Days practiced</div>
          <div className="v mono">{total.days}</div>
          <div className="s">in {rangeLabel}</div>
        </div>
        <div className="stat" data-testid="hist-hours">
          <div className="eyebrow">Time drawn</div>
          <div className="v mono">{fmtMin(total.minutes)}</div>
          <div className="s">in {rangeLabel}</div>
        </div>
        <div className="stat" data-testid="hist-streak">
          <div className="eyebrow">Longest streak</div>
          <div className="v mono">{ins.longestStreak} day{ins.longestStreak === 1 ? '' : 's'}</div>
          <div className="s">in {rangeLabel}</div>
        </div>
        <div className="stat" data-testid="hist-avg">
          <div className="eyebrow">Per practice day</div>
          <div className="v mono">{ins.perPracticeDay === null ? '–' : fmtMin(ins.perPracticeDay)}</div>
          <div className="s">average</div>
        </div>
      </div>

      <div className="history-top">
        <section className="card" aria-labelledby="heat-title">
          <div className="card-head">
            <h2 id="heat-title">Practice, {rangeLabel}</h2>
            <Legend />
          </div>
          <Heatmap rows={rows} label={`Practice heatmap for ${rangeLabel}: ${total.days} days practiced`} />
        </section>

        <div className="side-stack">
          <section className="card" aria-labelledby="range-title">
            <div className="card-head"><h2 id="range-title">Range</h2></div>
            <div className="range-list" role="group" aria-labelledby="range-title">
              <button type="button" aria-pressed={range === 'past'} data-testid="range-past" onClick={() => setRange('past')}>Past year</button>
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={range === y} data-testid={`range-${y}`} onClick={() => setRange(y)}>{y}</button>
              ))}
            </div>
          </section>
          <section className="card" aria-labelledby="ins-title">
            <div className="card-head"><h2 id="ins-title">Insights</h2></div>
            {ins.bestMonth ? (
              <div data-testid="insights">
                <div className="insight"><span className="muted">Best month</span><span>{ins.bestMonth.label} · {ins.bestMonth.hours} h</span></div>
                <div className="insight"><span className="muted">Busiest weekday</span><span>{ins.busiestWeekday?.name} · {ins.busiestWeekday?.hours} h</span></div>
              </div>
            ) : (
              <p className="muted">Nothing in {rangeLabel} yet.</p>
            )}
          </section>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card" aria-labelledby="recent-title">
          <div className="card-head"><h2 id="recent-title">Recent sessions</h2></div>
          {recent.length === 0 ? (
            <p className="muted" data-testid="no-sessions">No sessions yet. Finish one, or log practice from the Practice page.</p>
          ) : (
            <div className="row-list" data-testid="recent-list">
              {recent.map((s) => (
                <div key={s.id} className="row" data-testid="session-row">
                  <div className="grow">
                    <div className="title">{s.type}{s.note ? ` · ${s.note}` : ''}</div>
                    <div className="muted small">
                      {relativeDay(s.date, today)}
                      {s.images > 0 ? ` · ${s.images} image${s.images === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  {s.source === 'manual' && <span className="badge">Logged</span>}
                  <span className="mono">{sessionMinutes(s) > 0 ? fmtMin(sessionMinutes(s)) : '<1m'}</span>
                  <button type="button" className="icon-btn" aria-label={`Delete ${s.type} session from ${parseLocalDate(s.date).toDateString()}`} data-testid="session-delete" onClick={() => setDeleting(s)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="type-title">
          <div className="card-head"><h2 id="type-title">By type</h2><span className="muted small">last 30 days</span></div>
          {types.length === 0 ? (
            <p className="muted">Nothing in the last 30 days.</p>
          ) : (
            <div className="bars" data-testid="by-type">
              {types.map((t) => (
                <div key={t.type} className="bar-row" data-testid="type-row">
                  <span>{t.type}</span>
                  <div className="bar"><span style={{ width: `${(t.minutes / maxType) * 100}%` }} /></div>
                  <span className="mono muted small" style={{ textAlign: 'right' }}>{fmtMin(t.minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this session?"
        description="It will be removed from your totals and the heatmap."
        confirmLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          void api()
            .deleteSession(deleting.id)
            .then(() => reload());
          setDeleting(null);
        }}
      />
    </>
  );
}
