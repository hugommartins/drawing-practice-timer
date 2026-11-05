import type { SessionRecord } from './types';
import { MONTHS, WEEKDAYS, addDays, daysInMonth, localDate, parseLocalDate, startOfDay, startOfWeek } from './dates';

export type Level = 0 | 1 | 2 | 3 | 4;

/** Minutes a session counts for. Sub-20-second sessions count for nothing. */
export function sessionMinutes(s: Pick<SessionRecord, 'seconds'>): number {
  if (s.seconds < 20) return 0;
  return Math.max(1, Math.round(s.seconds / 60));
}

export function level(minutes: number): Level {
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

/** date (YYYY-MM-DD) -> minutes practiced that day. */
export function minutesByDate(sessions: readonly SessionRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) map.set(s.date, (map.get(s.date) ?? 0) + sessionMinutes(s));
  return map;
}

export interface Tally {
  days: number;
  minutes: number;
}

/** Days practiced and minutes drawn between two dates, both inclusive. */
export function tally(byDate: Map<string, number>, from: Date, to: Date): Tally {
  let days = 0;
  let minutes = 0;
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    const m = byDate.get(localDate(d)) ?? 0;
    if (m > 0) {
      days++;
      minutes += m;
    }
  }
  return { days, minutes };
}

export function weekMinutes(byDate: Map<string, number>, today: Date): number {
  return tally(byDate, startOfWeek(today), today).minutes;
}

/** Last 365 days including today. */
export function pastYear(byDate: Map<string, number>, today: Date): Tally {
  return tally(byDate, addDays(today, -364), today);
}

export function lifetime(sessions: readonly SessionRecord[]): Tally {
  const byDate = minutesByDate(sessions);
  let days = 0;
  let minutes = 0;
  for (const m of byDate.values()) {
    if (m > 0) {
      days++;
      minutes += m;
    }
  }
  return { days, minutes };
}

export type HeatRange = 'past' | number;

export interface HeatCell {
  day: number;
  minutes: number;
  level: Level;
  /** False for days outside the range (before the start, after today, past month end). */
  inRange: boolean;
  isToday: boolean;
  tip: string;
}

export interface HeatRow {
  key: string;
  label: string;
  hours: number;
  cells: HeatCell[];
}

export function rangeBounds(range: HeatRange, today: Date): { from: Date; to: Date } {
  if (range === 'past') return { from: addDays(startOfDay(today), -364), to: startOfDay(today) };
  const end = new Date(range, 11, 31);
  return { from: new Date(range, 0, 1), to: end > today ? startOfDay(today) : end };
}

/** One row per month, 31 columns per row. */
export function heatmapRows(byDate: Map<string, number>, range: HeatRange, today: Date): HeatRow[] {
  const { from, to } = rangeBounds(range, today);
  const todayKey = localDate(today);
  const rows: HeatRow[] = [];
  let y = from.getFullYear();
  let m = from.getMonth();
  while (y < to.getFullYear() || (y === to.getFullYear() && m <= to.getMonth())) {
    const dim = daysInMonth(y, m);
    const cells: HeatCell[] = [];
    let mins = 0;
    for (let day = 1; day <= 31; day++) {
      if (day > dim) {
        cells.push({ day, minutes: 0, level: 0, inRange: false, isToday: false, tip: '' });
        continue;
      }
      const date = new Date(y, m, day);
      const inRange = date >= from && date <= to;
      const key = localDate(date);
      const minutes = inRange ? (byDate.get(key) ?? 0) : 0;
      mins += minutes;
      cells.push({
        day,
        minutes,
        level: level(minutes),
        inRange,
        isToday: key === todayKey,
        tip: inRange ? `${MONTHS[m]} ${day} · ${minutes > 0 ? `${minutes} min` : 'no practice'}` : '',
      });
    }
    rows.push({
      key: `${y}-${m}`,
      label: range === 'past' ? `${MONTHS[m]} '${String(y).slice(2)}` : (MONTHS[m] ?? ''),
      hours: Math.round((mins / 60) * 10) / 10,
      cells,
    });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return rows;
}

export interface Insights {
  longestStreak: number;
  bestMonth: { label: string; hours: number } | null;
  busiestWeekday: { name: string; hours: number } | null;
  perPracticeDay: number | null;
}

export function insights(byDate: Map<string, number>, range: HeatRange, today: Date): Insights {
  const { from, to } = rangeBounds(range, today);
  let run = 0;
  let longest = 0;
  let active = 0;
  let total = 0;
  const wd = [0, 0, 0, 0, 0, 0, 0];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    const m = byDate.get(localDate(d)) ?? 0;
    if (m > 0) {
      run++;
      active++;
      total += m;
      wd[d.getDay()] = (wd[d.getDay()] ?? 0) + m;
      if (run > longest) longest = run;
    } else run = 0;
  }
  if (active === 0) return { longestStreak: 0, bestMonth: null, busiestWeekday: null, perPracticeDay: null };
  const rows = heatmapRows(byDate, range, today);
  const best = rows.reduce((a, r) => (r.hours > a.hours ? r : a), rows[0]!);
  const bw = wd.indexOf(Math.max(...wd));
  return {
    longestStreak: longest,
    bestMonth: { label: best.label, hours: best.hours },
    busiestWeekday: { name: WEEKDAYS[bw] ?? '', hours: Math.round((wd[bw] ?? 0) / 60) },
    perPracticeDay: Math.round(total / active),
  };
}

/** Years that have at least one session, newest first, plus the current year. */
export function yearsWithData(sessions: readonly SessionRecord[], today: Date): number[] {
  const years = new Set<number>([today.getFullYear()]);
  for (const s of sessions) years.add(parseLocalDate(s.date).getFullYear());
  return [...years].sort((a, b) => b - a);
}

export interface TypeTotal {
  type: string;
  minutes: number;
}

/** Minutes per drawing type over the last `days` days, biggest first. */
export function byType(sessions: readonly SessionRecord[], today: Date, days = 30): TypeTotal[] {
  const from = addDays(startOfDay(today), -(days - 1));
  const map = new Map<string, number>();
  for (const s of sessions) {
    const d = parseLocalDate(s.date);
    if (d < from || d > today) continue;
    map.set(s.type, (map.get(s.type) ?? 0) + sessionMinutes(s));
  }
  return [...map.entries()]
    .map(([type, minutes]) => ({ type, minutes }))
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

/** Last N days, oldest first, for compact strips. */
export function recentDays(byDate: Map<string, number>, today: Date, n: number): { date: string; minutes: number; level: Level }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = localDate(addDays(today, -i));
    const minutes = byDate.get(date) ?? 0;
    out.push({ date, minutes, level: level(minutes) });
  }
  return out;
}
