import type { HeatRow } from '../../shared/stats';

const TICKS = Array.from({ length: 31 }, (_, i) => (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''));
/** Dot diameter as a share of the cell, by level. */
const SIZE = [22, 40, 58, 76, 94];

export function Legend() {
  return (
    <div className="legend" aria-hidden="true">
      <span>Less</span>
      {[0, 1, 2, 3, 4].map((l) => (
        <span key={l} className="legend-cell">
          <span className={`dot lv${l}`} style={{ width: 4 + l * 2, height: 4 + l * 2 }} />
        </span>
      ))}
      <span>More</span>
    </div>
  );
}

/** One row per month, one dot per day. Dot size and colour both follow the level. */
export function Heatmap({ rows, label }: { rows: HeatRow[]; label: string }) {
  return (
    <div role="img" aria-label={label} className="heatmap" data-testid="heatmap">
      <div className="heat-row heat-head" aria-hidden="true">
        <span />
        <div className="heat-cells">
          {TICKS.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <span className="heat-hours">hours</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="heat-row" aria-hidden="true" data-testid="heat-row">
          <span className="heat-label">{r.label}</span>
          <div className="heat-cells">
            {r.cells.map((c) => (
              <div key={c.day} className="heat-cell" title={c.tip} data-level={c.inRange ? c.level : undefined}>
                {c.inRange && <span className={`dot lv${c.level}${c.isToday ? ' today' : ''}`} style={{ width: `${SIZE[c.level]}%` }} />}
              </div>
            ))}
          </div>
          <span className="heat-hours mono">{r.hours.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
