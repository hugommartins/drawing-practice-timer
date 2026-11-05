import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, localDate } from '../../src/shared/dates';
import { byType, heatmapRows, insights, level, lifetime, minutesByDate, pastYear, recentDays, sessionMinutes, weekMinutes, yearsWithData } from '../../src/shared/stats';
import type { SessionRecord } from '../../src/shared/types';

// Friday 30 Oct 2026, local time.
const TODAY = new Date(2026, 9, 30);

let n = 0;
function s(daysAgo: number, minutes: number, type = 'Figure'): SessionRecord {
  const d = addDays(TODAY, -daysAgo);
  return { id: `s${n++}`, date: localDate(d), startedAt: d.toISOString(), type, collectionId: null, mode: 'per-image', seconds: minutes * 60, images: 10, source: 'app' };
}

describe('minutes and levels', () => {
  it('rounds to minutes and ignores sessions under 20 seconds', () => {
    assert.equal(sessionMinutes({ seconds: 10 }), 0);
    assert.equal(sessionMinutes({ seconds: 20 }), 1);
    assert.equal(sessionMinutes({ seconds: 89 }), 1);
    assert.equal(sessionMinutes({ seconds: 90 }), 2);
  });
  it('level thresholds', () => {
    assert.deepEqual([0, 1, 14, 15, 29, 30, 59, 60, 300].map(level), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('totals', () => {
  const sessions = [s(0, 20), s(0, 10), s(1, 45), s(4, 30), s(5, 60), s(400, 90)];
  const by = minutesByDate(sessions);
  it('sums sessions on the same day', () => {
    assert.equal(by.get(localDate(TODAY)), 30);
  });
  it('week starts on Monday: Fri 30 Oct covers Mon 26 .. Fri 30', () => {
    // today 30, yesterday 45, 4 days ago = Mon 26 -> 30, 5 days ago = Sun 25 is last week
    assert.equal(weekMinutes(by, TODAY), 30 + 45 + 30);
  });
  it('past year is the last 365 days including today', () => {
    const y = pastYear(by, TODAY);
    assert.equal(y.days, 4);
    assert.equal(y.minutes, 30 + 45 + 30 + 60);
  });
  it('lifetime includes everything', () => {
    assert.deepEqual(lifetime(sessions), { days: 5, minutes: 30 + 45 + 30 + 60 + 90 });
  });
  it('empty data gives zeros', () => {
    assert.deepEqual(lifetime([]), { days: 0, minutes: 0 });
    assert.equal(weekMinutes(new Map(), TODAY), 0);
  });
});

describe('heatmap', () => {
  const sessions = [s(0, 20), s(1, 45), s(40, 70)];
  const by = minutesByDate(sessions);
  it('past-year range runs from the month 364 days ago to this month', () => {
    const rows = heatmapRows(by, 'past', TODAY);
    assert.equal(rows[0]?.label, "Oct '25");
    assert.equal(rows.at(-1)?.label, "Oct '26");
    assert.equal(rows.length, 13);
  });
  it('marks today, hides future days and days past month end', () => {
    const oct = heatmapRows(by, 'past', TODAY).at(-1)!;
    const today = oct.cells.find((c) => c.isToday)!;
    assert.equal(today.day, 30);
    assert.equal(today.level, 2);
    assert.equal(oct.cells[30]!.inRange, false); // 31 Oct is after today
    const feb = heatmapRows(new Map(), 2026, TODAY)[1]!;
    assert.equal(feb.cells[28]!.inRange, false); // 29 Feb does not exist in 2026
    assert.equal(feb.cells[27]!.inRange, true);
  });
  it('a calendar year shows Jan to Dec, or up to today for the current year', () => {
    assert.equal(heatmapRows(by, 2025, TODAY).length, 12);
    assert.equal(heatmapRows(by, 2026, TODAY).length, 10);
  });
  it('row hours add up', () => {
    const rows = heatmapRows(by, 'past', TODAY);
    const total = rows.reduce((a, r) => a + r.hours, 0);
    assert.ok(Math.abs(total - (20 + 45 + 70) / 60) < 0.3);
  });
});

describe('insights', () => {
  it('finds streak, best month, weekday and average', () => {
    const sessions = [s(0, 30), s(1, 30), s(2, 30), s(5, 60), s(6, 60)];
    const i = insights(minutesByDate(sessions), 'past', TODAY);
    assert.equal(i.longestStreak, 3);
    assert.equal(i.bestMonth?.label, "Oct '26");
    assert.equal(i.perPracticeDay, 42);
    assert.ok(i.busiestWeekday);
  });
  it('is empty without practice', () => {
    assert.deepEqual(insights(new Map(), 'past', TODAY), { longestStreak: 0, bestMonth: null, busiestWeekday: null, perPracticeDay: null });
  });
});

describe('types and strips', () => {
  const sessions = [s(0, 20, 'Figure'), s(2, 10, 'Gesture'), s(3, 25, 'Figure'), s(60, 100, 'Portrait')];
  it('by type covers the last 30 days only, biggest first', () => {
    assert.deepEqual(byType(sessions, TODAY), [{ type: 'Figure', minutes: 45 }, { type: 'Gesture', minutes: 10 }]);
  });
  it('recent days strip is oldest first and has n entries', () => {
    const strip = recentDays(minutesByDate(sessions), TODAY, 14);
    assert.equal(strip.length, 14);
    assert.equal(strip.at(-1)?.date, localDate(TODAY));
    assert.equal(strip.at(-1)?.minutes, 20);
  });
  it('years list includes the current year and years with data, newest first', () => {
    const old: SessionRecord = { ...s(0, 5), date: '2023-04-02' };
    assert.deepEqual(yearsWithData([old], TODAY), [2026, 2023]);
  });
});

describe('window boundaries', () => {
  it('past year is exactly 365 days: day 364 ago is in, day 365 ago is out', () => {
    const by = minutesByDate([s(364, 10), s(365, 99)]);
    assert.deepEqual(pastYear(by, TODAY), { days: 1, minutes: 10 });
  });
  it('by-type window is exactly 30 days: day 29 ago is in, day 30 ago is out', () => {
    assert.deepEqual(byType([s(29, 10, 'In'), s(30, 99, 'Out')], TODAY), [{ type: 'In', minutes: 10 }]);
  });
  it('by-type ignores sessions dated in the future', () => {
    assert.deepEqual(byType([s(-1, 50, 'Future')], TODAY), []);
  });
});
