import { describe, expect, it } from 'vitest';
import { formatDue, getDueSoon } from './checklist';
import type { CalEvent } from '../types';

// Local-time dates keep these tests independent of the machine's time zone.
const now = new Date(2026, 9, 26, 10, 0); // Mon Oct 26 2026, 10:00
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

function assignment(id: string, due: string, extra: Partial<CalEvent> = {}): CalEvent {
  return {
    id, uid: `uid-${id}`, calendarId: 'canvas:1', title: id, start: due, end: due,
    allDay: false, kind: 'assignment', course: 'CSE 110', ...extra,
  };
}

describe('getDueSoon', () => {
  const events: CalEvent[] = [
    assignment('later', at(30, 23, 59)),
    assignment('soon', at(26, 12)),
    assignment('late', at(25, 23, 59)),
    assignment('oldLate', at(24, 9)),
    assignment('tooOld', at(10, 9)),
    assignment('tooFar', at(26 + 20, 9)),
    assignment('finished', at(27, 9)),
    { ...assignment('meeting', at(26, 15)), kind: 'event' },
  ];
  const groups = getDueSoon(events, { 'uid-finished': 1 }, now);

  it('puts not-done future assignments in upcoming, soonest first', () => {
    expect(groups.upcoming.map((e) => e.id)).toEqual(['soon', 'later']);
  });
  it('lists overdue assignments within the past window, most recent first', () => {
    expect(groups.overdue.map((e) => e.id)).toEqual(['late', 'oldLate']);
  });
  it('separates completed ones', () => {
    expect(groups.completed.map((e) => e.id)).toEqual(['finished']);
  });
  it('respects custom windows', () => {
    const g = getDueSoon(events, {}, now, { pastDays: 1, aheadDays: 1 });
    expect(g.overdue.map((e) => e.id)).toEqual(['late']);
    expect(g.upcoming.map((e) => e.id)).toEqual(['soon', 'finished']);
  });
});

describe('formatDue', () => {
  it.each([
    [at(26, 10, 45), 'in 45 min'],
    [at(26, 13, 10), 'in 3 h'],
    [at(26, 23, 59), 'Today 11:59 PM'],
    [at(27, 23, 59), 'Tomorrow 11:59 PM'],
    [at(30, 23, 59), 'Fri 11:59 PM'],
    [new Date(2026, 10, 12, 9).toISOString(), 'Nov 12'],
    [at(26, 9, 30), '30 min ago'],
    [at(26, 7), '3 h ago'],
    [at(25, 8), 'Yesterday'],
    [at(24, 23, 59), '2 days ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatDue(iso, now)).toBe(expected);
  });
});
