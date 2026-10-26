import { describe, expect, it } from 'vitest';
import { describeOffset, planReminders, reminderBody } from './reminders';
import type { CalEvent } from '../types';

const MIN = 60000;
const now = Date.UTC(2026, 9, 26, 12);

function assignment(id: string, dueInMin: number, extra: Partial<CalEvent> = {}): CalEvent {
  const due = new Date(now + dueInMin * MIN).toISOString();
  return {
    id, uid: id, calendarId: 'canvas:1', title: id, start: due, end: due,
    allDay: false, kind: 'assignment', course: 'CSE 110', ...extra,
  };
}

describe('planReminders', () => {
  it('plans each offset that fires within the next 24h, soonest first', () => {
    const plan = planReminders([assignment('a', 120)], {}, [1440, 60, 15], now, {});
    expect(plan.map((p) => p.key)).toEqual(['a:60', 'a:15']);
    expect(plan[0].fireAt).toBe(now + 60 * MIN);
  });

  it('includes a 1-day reminder that fires later today', () => {
    const plan = planReminders([assignment('a', 1440 + 300)], {}, [1440], now, {});
    expect(plan).toHaveLength(1);
    expect(plan[0].fireAt).toBe(now + 300 * MIN);
  });

  it('skips reminders beyond the horizon', () => {
    expect(planReminders([assignment('a', 3 * 1440)], {}, [60], now, {})).toEqual([]);
  });

  it('fires a missed reminder only if less than 5 minutes late', () => {
    const plan = planReminders([assignment('a', 57), assignment('b', 50)], {}, [60], now, {});
    expect(plan.map((p) => p.key)).toEqual(['a:60']);
  });

  it('skips done, already fired, past-due and non-assignment items', () => {
    const events = [
      assignment('done', 30),
      assignment('fired', 30),
      assignment('past', -10),
      { ...assignment('event', 30), kind: 'event' as const },
      assignment('ok', 30),
    ];
    const plan = planReminders(events, { done: 1 }, [15], now, { 'fired:15': now - MIN });
    expect(plan.map((p) => p.key)).toEqual(['ok:15']);
  });

  it('dedupes duplicate occurrences of the same uid', () => {
    const plan = planReminders([assignment('a', 30), assignment('a', 30)], {}, [15], now, {});
    expect(plan).toHaveLength(1);
  });
});

describe('reminder text', () => {
  it('describes offsets', () => {
    expect([10080, 1440, 2880, 180, 60, 15].map(describeOffset)).toEqual([
      '1 week', '1 day', '2 days', '3 hours', '1 hour', '15 minutes',
    ]);
  });
  it('builds the body with the course', () => {
    expect(reminderBody(assignment('a', 60), 60)).toBe('CSE 110 · due in 1 hour');
    expect(reminderBody(assignment('a', 60, { course: undefined }), 15)).toBe('Due in 15 minutes');
  });
});
