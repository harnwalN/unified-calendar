import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../types';
import {
  aggregate, clampSpans, collectSpans, estimateRows, formatClock, formatDuration, parseDuration, splitAtMidnight,
} from './timeStats';

const t = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const H = 3_600_000;
const entry = (id: string, ref: TimeEntry['taskRef'], start: number, end: number, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id, taskRef: ref, start: new Date(start).toISOString(), end: new Date(end).toISOString(), updatedAt: 1, ...extra,
});

describe('splitAtMidnight', () => {
  it('keeps same-day spans whole', () => {
    expect(splitAtMidnight(t(26, 9), t(26, 10))).toEqual([[t(26, 9), t(26, 10)]]);
  });
  it('splits at each local midnight', () => {
    expect(splitAtMidnight(t(26, 23), t(28, 1))).toEqual([
      [t(26, 23), t(27, 0)],
      [t(27, 0), t(28, 0)],
      [t(28, 0), t(28, 1)],
    ]);
  });
  it('handles the DST change day (Nov 1 in US zones) without drifting', () => {
    const parts = splitAtMidnight(new Date(2026, 9, 31, 12).getTime(), new Date(2026, 10, 2, 12).getTime());
    expect(parts.map(([s]) => new Date(s).getHours())).toEqual([12, 0, 0]);
  });
  it('returns nothing for empty spans', () => {
    expect(splitAtMidnight(5, 5)).toEqual([]);
  });
});

describe('collectSpans / clampSpans', () => {
  const entries = {
    a: entry('a', 't:x', t(26, 9), t(26, 10)),
    b: entry('b', 't:x', t(26, 11), t(26, 12), { deleted: true }),
    c: entry('c', 't:y', t(26, 12), t(26, 11)), // invalid
  };
  it('skips deleted and invalid entries, adds the running timer up to now', () => {
    const spans = collectSpans(entries, { taskRef: 't:z', start: new Date(t(26, 13)).toISOString() }, t(26, 13, 30));
    expect(spans.map((s) => [s.taskRef, s.end - s.start])).toEqual([['t:x', H], ['t:z', H / 2]]);
    expect(collectSpans(entries)).toHaveLength(1);
  });
  it('clamps to the range', () => {
    const spans = collectSpans(entries);
    expect(clampSpans(spans, t(26, 9, 30), t(27, 0))[0]).toMatchObject({ start: t(26, 9, 30), end: t(26, 10) });
    expect(clampSpans(spans, t(27, 0), t(28, 0))).toEqual([]);
  });
});

describe('aggregate', () => {
  const entries = {
    a: entry('a', 'a:hw', t(26, 9), t(26, 11)),
    b: entry('b', 't:read', t(26, 23), t(27, 1)),
    c: entry('c', 'a:hw', t(27, 10), t(27, 10, 30)),
    d: entry('d', 'a:hw', t(20, 10), t(20, 11)), // outside range
  };
  const group = (ref: string) => (ref.startsWith('a:') ? 'cse' : 'personal');
  const stats = aggregate(collectSpans(entries), t(26, 0), t(28, 0), group);

  it('totals by day, group and task, splitting across midnight', () => {
    expect(stats.totalMs).toBe(4.5 * H);
    expect(stats.byDay.get('2026-10-26')).toBe(3 * H);
    expect(stats.byDay.get('2026-10-27')).toBe(1.5 * H);
    expect(stats.byGroup.get('cse')).toBe(2.5 * H);
    expect(stats.byGroup.get('personal')).toBe(2 * H);
    expect(stats.byTask.get('a:hw')).toBe(2.5 * H);
    expect(stats.byDayGroup.get('2026-10-27')?.get('personal')).toBe(H);
    expect(stats.spans).toHaveLength(4);
    expect(stats.spans.map((s) => s.start)).toEqual([...stats.spans.map((s) => s.start)].sort((x, y) => x - y));
  });
});

describe('estimateRows', () => {
  it('compares estimate to actual, most over first, skipping tasks without estimates', () => {
    const rows = estimateRows(
      [{ ref: 't:a', estimateMin: 60 }, { ref: 't:b', estimateMin: 30 }, { ref: 't:c' }, { ref: 't:d', estimateMin: 10 }],
      new Map([['t:a', 30 * 60_000], ['t:b', 45 * 60_000]]),
    );
    expect(rows.map((r) => [r.ref, r.ratio])).toEqual([['t:b', 1.5], ['t:a', 0.5], ['t:d', 0]]);
  });
});

describe('formatting', () => {
  it('formats durations and clocks', () => {
    expect(formatDuration(40_000)).toBe('40s');
    expect(formatDuration(25 * 60_000)).toBe('25m');
    expect(formatDuration(85 * 60_000)).toBe('1h 25m');
    expect(formatDuration(2 * H)).toBe('2h');
    expect(formatClock(4 * 60_000 + 9_000)).toBe('0:04:09');
    expect(formatClock(12 * H + 1000)).toBe('12:00:01');
  });
  it('parses typed durations', () => {
    expect(parseDuration('90')).toBe(90 * 60_000);
    expect(parseDuration('1:30')).toBe(90 * 60_000);
    expect(parseDuration('1h 30m')).toBe(90 * 60_000);
    expect(parseDuration('1.5h')).toBe(90 * 60_000);
    expect(parseDuration('45 min')).toBe(45 * 60_000);
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('0')).toBeNull();
  });
});
