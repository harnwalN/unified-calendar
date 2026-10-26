import { describe, expect, it } from 'vitest';
import {
  agendaTime,
  barIndexes,
  daySegment,
  daysFrom,
  describeWhen,
  eventDayRange,
  isAllDayRow,
  layoutBars,
  layoutOverlaps,
  monthGridDays,
  rangeTitle,
  shortTime,
  stepCursor,
  viewTitle,
  visibleDays,
} from './time';

const iso = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('layoutOverlaps', () => {
  it('gives non-overlapping events the full width', () => {
    const r = layoutOverlaps([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 60, end: 120 },
    ]);
    expect(r.get('a')).toEqual({ col: 0, cols: 1, span: 1 });
    expect(r.get('b')).toEqual({ col: 0, cols: 1, span: 1 });
  });

  it('puts overlapping events side by side', () => {
    const r = layoutOverlaps([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
    ]);
    expect(r.get('a')).toEqual({ col: 0, cols: 2, span: 1 });
    expect(r.get('b')).toEqual({ col: 1, cols: 2, span: 1 });
  });

  it('reuses freed columns and expands into empty ones', () => {
    // a: long, b and c sequential next to it, d overlaps only c.
    const r = layoutOverlaps([
      { id: 'a', start: 0, end: 240 },
      { id: 'b', start: 0, end: 60 },
      { id: 'c', start: 60, end: 120 },
      { id: 'd', start: 90, end: 150 },
      { id: 'e', start: 180, end: 210 },
    ]);
    expect(r.get('a')).toMatchObject({ col: 0, cols: 3 });
    expect(r.get('b')).toEqual({ col: 1, cols: 3, span: 2 });
    expect(r.get('c')).toEqual({ col: 1, cols: 3, span: 1 });
    expect(r.get('d')).toEqual({ col: 2, cols: 3, span: 1 });
    // e starts after c and d end, so it takes column 1 and stretches over column 2.
    expect(r.get('e')).toEqual({ col: 1, cols: 3, span: 2 });
  });

  it('starts a new cluster after a gap', () => {
    const r = layoutOverlaps([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 60 },
      { id: 'c', start: 120, end: 180 },
    ]);
    expect(r.get('c')).toEqual({ col: 0, cols: 1, span: 1 });
  });

  it('is independent of input order', () => {
    const items = [
      { id: 'x', start: 10, end: 50 },
      { id: 'y', start: 0, end: 30 },
      { id: 'z', start: 20, end: 40 },
    ];
    expect(layoutOverlaps(items)).toEqual(layoutOverlaps([...items].reverse()));
  });
});

describe('layoutBars', () => {
  it('stacks overlapping bars into lanes', () => {
    const r = layoutBars([
      { id: 'a', startIdx: 0, endIdx: 2 },
      { id: 'b', startIdx: 1, endIdx: 1 },
      { id: 'c', startIdx: 3, endIdx: 4 },
    ]);
    const lanes = Object.fromEntries(r.map((b) => [b.id, b.lane]));
    expect(lanes).toEqual({ a: 0, b: 1, c: 0 });
  });
});

describe('event geometry', () => {
  it('treats all-day end as exclusive', () => {
    const e = { start: iso(2026, 10, 26), end: iso(2026, 10, 28), allDay: true };
    const [first, last] = eventDayRange(e);
    expect(first.getDate()).toBe(26);
    expect(last.getDate()).toBe(27);
  });

  it('routes long timed events to the all-day row', () => {
    expect(isAllDayRow({ start: iso(2026, 10, 26, 9), end: iso(2026, 10, 28, 17), allDay: false })).toBe(true);
    expect(isAllDayRow({ start: iso(2026, 10, 26, 9), end: iso(2026, 10, 26, 17), allDay: false })).toBe(false);
  });

  it('clips segments to the day', () => {
    const e = { start: iso(2026, 10, 26, 22), end: iso(2026, 10, 27, 2) };
    expect(daySegment(e, new Date(2026, 9, 26))).toEqual({ startMin: 22 * 60, endMin: 24 * 60 });
    expect(daySegment(e, new Date(2026, 9, 27))).toEqual({ startMin: 0, endMin: 120 });
    expect(daySegment(e, new Date(2026, 9, 28))).toBeNull();
  });

  it('places point events on their day only', () => {
    const e = { start: iso(2026, 10, 30, 23, 59), end: iso(2026, 10, 30, 23, 59) };
    expect(daySegment(e, new Date(2026, 9, 30))).toEqual({ startMin: 1439, endMin: 1439 });
    expect(daySegment(e, new Date(2026, 9, 31))).toBeNull();
  });

  it('clips bar indexes to the visible range', () => {
    const days = daysFrom(new Date(2026, 9, 25), 7);
    expect(barIndexes({ start: iso(2026, 10, 20), end: iso(2026, 10, 27) }, days)).toEqual({ startIdx: 0, endIdx: 1 });
    expect(barIndexes({ start: iso(2026, 11, 5), end: iso(2026, 11, 6) }, days)).toBeNull();
  });
});

describe('navigation & titles', () => {
  const cursor = new Date(2026, 9, 26, 12); // Mon Oct 26 2026

  it('computes week and narrow ranges', () => {
    expect(visibleDays('week', cursor, 0)[0].getDate()).toBe(25);
    expect(visibleDays('week', cursor, 1)[0].getDate()).toBe(26);
    expect(visibleDays('week', cursor, 0, 3).map((d) => d.getDate())).toEqual([26, 27, 28]);
  });

  it('builds a 6-week month grid', () => {
    const days = monthGridDays(cursor, 0);
    expect(days).toHaveLength(42);
    expect(days[0].getMonth()).toBe(8); // Sep 27
    expect(days[0].getDate()).toBe(27);
  });

  it('steps by view', () => {
    expect(stepCursor('day', cursor, 1).getDate()).toBe(27);
    expect(stepCursor('week', cursor, -1).getDate()).toBe(19);
    expect(stepCursor('month', cursor, 1).getMonth()).toBe(10);
    expect(stepCursor('agenda', cursor, 1).getDate()).toBe(2);
    expect(stepCursor('week', cursor, 1, 3).getDate()).toBe(29);
  });

  it('formats titles across month and year boundaries', () => {
    expect(rangeTitle(daysFrom(new Date(2026, 9, 4), 7))).toBe('October 2026');
    expect(rangeTitle(daysFrom(new Date(2026, 9, 29), 7))).toBe('Oct – Nov 2026');
    expect(rangeTitle(daysFrom(new Date(2026, 11, 29), 7))).toBe('Dec 2026 – Jan 2027');
    expect(viewTitle('month', cursor, 0)).toBe('October 2026');
    expect(viewTitle('day', cursor, 0)).toBe('October 26, 2026');
  });
});

describe('formatting', () => {
  it('formats short times', () => {
    expect(shortTime(new Date(2026, 0, 1, 10))).toBe('10am');
    expect(shortTime(new Date(2026, 0, 1, 22, 30))).toBe('10:30pm');
  });

  it('describes deadlines, all-day and timed events', () => {
    const due = iso(2026, 10, 30, 23, 59);
    expect(describeWhen({ start: due, end: due, allDay: false, kind: 'assignment' })).toBe('Due Fri, Oct 30 · 11:59 PM');
    expect(describeWhen({ start: iso(2026, 10, 30), end: iso(2026, 10, 31), allDay: true, kind: 'event' })).toBe(
      'Friday, October 30',
    );
    expect(describeWhen({ start: iso(2026, 10, 30), end: iso(2026, 11, 2), allDay: true, kind: 'event' })).toBe(
      'Oct 30 – Nov 1, 2026',
    );
    expect(
      describeWhen({ start: iso(2026, 10, 30, 10), end: iso(2026, 10, 30, 11, 30), allDay: false, kind: 'event' }),
    ).toBe('Friday, October 30 · 10:00 – 11:30 AM');
    expect(
      describeWhen({ start: iso(2026, 10, 30, 11), end: iso(2026, 10, 30, 13), allDay: false, kind: 'event' }),
    ).toBe('Friday, October 30 · 11:00 AM – 1:00 PM');
  });

  it('formats agenda times', () => {
    const due = iso(2026, 10, 30, 23, 59);
    const day = new Date(2026, 9, 30);
    expect(agendaTime({ start: due, end: due, allDay: false, kind: 'assignment' }, day)).toBe('Due 11:59 PM');
    expect(agendaTime({ start: iso(2026, 10, 30), end: iso(2026, 10, 31), allDay: true, kind: 'event' }, day)).toBe(
      'All day',
    );
  });
});
