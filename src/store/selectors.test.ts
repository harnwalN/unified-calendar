import { describe, expect, it } from 'vitest';
import type { CalEvent, PersonalTask, TaskMeta } from '../types';
import { plannedEvents, plannedTaskRef, PLANNED_CALENDAR_ID } from './selectors';

const block = (id: string, h: number, durationMin = 60) => ({ id, start: new Date(2026, 9, 28, h).toISOString(), durationMin });

describe('plannedEvents', () => {
  const assignment: CalEvent = {
    id: 'hw', uid: 'event-assignment-7', calendarId: 'canvas:x', title: 'HW 4', start: '2026-10-30T06:59:00.000Z',
    end: '2026-10-30T06:59:00.000Z', allDay: false, kind: 'assignment',
  };
  const meta: Record<string, TaskMeta> = {
    'event-assignment-7': { uid: 'event-assignment-7', status: 'todo', priority: 'none', subtasks: [], updatedAt: 1, blocks: [block('b1', 14, 90)] },
    orphan: { uid: 'orphan', status: 'todo', priority: 'none', subtasks: [], updatedAt: 1, blocks: [block('b2', 9)] },
  };
  const tasks: Record<string, PersonalTask> = {
    p: { id: 'p', title: 'Essay', list: 'personal', status: 'done', priority: 'none', subtasks: [], createdAt: 1, updatedAt: 1, blocks: [block('b3', 10), block('b4', 16)] },
    gone: { id: 'gone', title: 'Old', list: 'personal', status: 'todo', priority: 'none', subtasks: [], createdAt: 1, updatedAt: 1, deleted: true, blocks: [block('b5', 8)] },
  };

  it('turns blocks of live tasks into calendar events', () => {
    const out = plannedEvents([assignment], meta, tasks);
    expect(out.map((e) => e.title)).toEqual(['HW 4', '✓ Essay', '✓ Essay']);
    expect(out[0]).toMatchObject({ calendarId: PLANNED_CALENDAR_ID, kind: 'event', allDay: false });
    expect(Date.parse(out[0].end) - Date.parse(out[0].start)).toBe(90 * 60_000);
  });

  it('maps an event id back to its task', () => {
    const [hw, essay] = plannedEvents([assignment], meta, tasks);
    expect(plannedTaskRef(hw.id)).toBe('a:event-assignment-7');
    expect(plannedTaskRef(essay.id)).toBe('t:p');
    expect(plannedTaskRef('google:x:y')).toBeNull();
  });
});
