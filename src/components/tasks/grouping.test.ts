import { describe, expect, it } from 'vitest';
import { dayLoads, fitsGap, freeMinutes, groupTasks, isTodayTask } from './grouping';
import { doDateLabel, dueLabel, formatDuration, openLinkLabel, relativeDue } from './format';
import type { CalEvent, ClassInfo, TaskView } from '../../types';

// Monday, Oct 26 2026, 2:00 PM local. Week (Sun start) = Oct 25 – Oct 31.
const NOW = new Date(2026, 9, 26, 14, 0);
const at = (d: number, h = 23, m = 59, month = 9) => new Date(2026, month, d, h, m).toISOString();

let n = 0;
function task(p: Partial<TaskView>): TaskView {
  const id = `x${n++}`;
  return {
    ref: p.source === 'personal' ? `t:${id}` : `a:${id}`,
    source: 'assignment',
    list: 'class',
    title: id,
    status: 'todo',
    priority: 'none',
    subtasks: [],
    timeTodayMs: 0,
    timeTotalMs: 0,
    ...p,
  };
}

const cls = (id: string, order: number, extra: Partial<ClassInfo> = {}): ClassInfo => ({
  id,
  name: id.toUpperCase(),
  color: '#123456',
  aliases: [],
  order,
  updatedAt: 0,
  ...extra,
});
const CLASSES = [cls('cse', 0), cls('math', 1), cls('hid', 2, { hidden: true }), cls('del', 3, { deleted: true })];

describe('isTodayTask', () => {
  it('due today, overdue, do-date today or earlier', () => {
    expect(isTodayTask(task({ due: at(26) }), NOW)).toBe(true);
    expect(isTodayTask(task({ due: at(26, 9) }), NOW)).toBe(true);
    expect(isTodayTask(task({ due: at(24) }), NOW)).toBe(true);
    expect(isTodayTask(task({ due: at(28), doDate: '2026-10-26' }), NOW)).toBe(true);
    expect(isTodayTask(task({ doDate: '2026-10-20', source: 'personal', list: 'personal' }), NOW)).toBe(true);
  });

  it('not tomorrow, not done, not stale assignments', () => {
    expect(isTodayTask(task({ due: at(27, 0, 0) }), NOW)).toBe(false);
    expect(isTodayTask(task({ due: at(26), status: 'done' }), NOW)).toBe(false);
    expect(isTodayTask(task({ due: at(1) }), NOW)).toBe(false);
    // Personal tasks never go stale.
    expect(isTodayTask(task({ due: at(1), source: 'personal', list: 'personal' }), NOW)).toBe(true);
  });
});

describe('groupTasks', () => {
  it('puts each task in exactly one section and respects Today override', () => {
    const today = task({ classId: 'cse', due: at(26), title: 'today' });
    const later = task({ classId: 'cse', due: at(30), title: 'later' });
    const noDue = task({ classId: 'cse', source: 'personal', title: 'nodue' });
    const doneT = task({ classId: 'cse', due: at(27), status: 'done', title: 'done' });
    const math = task({ classId: 'math', due: at(29) });
    const orphan = task({ due: at(29), title: 'orphan' });
    const personal = task({ source: 'personal', list: 'personal', title: 'p' });
    const quick = task({ source: 'personal', list: 'quick', title: 'q' });
    const hidden = task({ classId: 'hid', due: at(26) });
    const all = [later, today, noDue, doneT, math, orphan, personal, quick, hidden];

    const s = groupTasks(all, CLASSES, NOW);
    expect(s.today.map((t) => t.title)).toEqual(['today']);
    expect(s.classes.map((c) => c.id)).toEqual(['cse', 'math', 'other']);
    const cse = s.classes[0];
    expect(cse.open.map((t) => t.title)).toEqual(['later', 'nodue']);
    expect(cse.done.map((t) => t.title)).toEqual(['done']);
    expect(cse.inToday).toBe(1);
    // today, later, done are due this week; nodue is not.
    expect(cse.weekTotal).toBe(3);
    expect(cse.weekDone).toBe(1);
    expect(s.classes[2].open.map((t) => t.title)).toEqual(['orphan']);
    expect(s.personal.open.map((t) => t.title)).toEqual(['p']);
    expect(s.quick.open.map((t) => t.title)).toEqual(['q']);
    // Hidden class tasks are dropped everywhere.
    const placed = [
      ...s.today,
      ...s.classes.flatMap((c) => [...c.open, ...c.done, ...c.stale]),
      ...s.personal.open,
      ...s.quick.open,
    ];
    expect(placed).toHaveLength(all.length - 1);
    expect(new Set(placed.map((t) => t.ref)).size).toBe(placed.length);
  });

  it('omits Other when every assignment has a class', () => {
    const s = groupTasks([task({ classId: 'cse', due: at(30) })], CLASSES, NOW);
    expect(s.classes.map((c) => c.id)).toEqual(['cse', 'math']);
  });

  it('sorts Today overdue-first, sections by due with no-due last and priority ties', () => {
    const a = task({ classId: 'cse', due: at(26, 20), title: 'a' });
    const b = task({ classId: 'cse', due: at(25), title: 'b-overdue' });
    const c = task({ classId: 'math', due: at(26, 9), title: 'c-overdue-today' });
    const s1 = groupTasks([a, b, c], CLASSES, NOW);
    expect(s1.today.map((t) => t.title)).toEqual(['b-overdue', 'c-overdue-today', 'a']);

    const lo = task({ classId: 'cse', due: at(30), priority: 'low', title: 'lo' });
    const hi = task({ classId: 'cse', due: at(30), priority: 'high', title: 'hi' });
    const none = task({ classId: 'cse', title: 'none' });
    const early = task({ classId: 'cse', due: at(28), title: 'early' });
    const s2 = groupTasks([none, lo, hi, early], CLASSES, NOW);
    expect(s2.classes[0].open.map((t) => t.title)).toEqual(['early', 'hi', 'lo', 'none']);
  });

  it('collects counts and stale assignments', () => {
    const stale = task({ classId: 'cse', due: at(1), title: 'stale' });
    const overdue = task({ classId: 'cse', due: at(25) });
    const dueToday = task({ classId: 'math', due: at(26) });
    const s = groupTasks([stale, overdue, dueToday], CLASSES, NOW);
    expect(s.classes[0].stale.map((t) => t.title)).toEqual(['stale']);
    expect(s.classes[0].overdue).toBe(2);
    expect(s.overdueCount).toBe(2);
    expect(s.dueTodayCount).toBe(1);
    expect(s.openCount).toBe(3);
  });

  it('respects weekStartsOn for weekly progress', () => {
    const sun = task({ classId: 'cse', due: at(25, 12) });
    expect(groupTasks([sun], CLASSES, NOW, 0).classes[0].weekTotal).toBe(1);
    expect(groupTasks([sun], CLASSES, NOW, 1).classes[0].weekTotal).toBe(0);
  });
});

const ev = (p: Partial<CalEvent>): CalEvent => ({
  id: 'e',
  uid: 'e',
  calendarId: 'c',
  title: 'e',
  start: at(26, 15, 0),
  end: at(26, 16, 0),
  allDay: false,
  kind: 'event',
  ...p,
});

describe('freeMinutes / fitsGap', () => {
  it('gap until next timed event today', () => {
    expect(freeMinutes([ev({}), ev({ start: at(26, 17, 0), end: at(26, 18, 0) })], NOW)).toBe(60);
  });

  it('ignores past, all-day and deadline events; caps at 3h', () => {
    const events = [
      ev({ start: at(26, 9, 0), end: at(26, 10, 0) }),
      ev({ allDay: true, start: at(26, 0, 0), end: at(27, 0, 0) }),
      ev({ kind: 'assignment', start: at(26, 14, 30), end: at(26, 14, 30) }),
    ];
    expect(freeMinutes(events, NOW)).toBe(180);
  });

  it('stops at midnight', () => {
    expect(freeMinutes([], new Date(2026, 9, 26, 23, 0))).toBe(60);
  });

  it('items without estimates count as 10 min', () => {
    expect(fitsGap({}, 10)).toBe(true);
    expect(fitsGap({}, 9)).toBe(false);
    expect(fitsGap({ estimateMin: 30 }, 25)).toBe(false);
  });
});

describe('dayLoads', () => {
  it('counts events touching each day and open tasks due', () => {
    const days = [new Date(2026, 9, 26), new Date(2026, 9, 27)];
    const loads = dayLoads(
      days,
      [ev({}), ev({ start: at(26, 23, 0), end: at(27, 1, 0) }), ev({ kind: 'assignment' })],
      [task({ due: at(27) }), task({ due: at(27), status: 'done' })],
    );
    expect(loads.map((l) => [l.events, l.tasksDue])).toEqual([
      [2, 0],
      [1, 1],
    ]);
  });
});

describe('format helpers', () => {
  it('dueLabel', () => {
    expect(dueLabel(at(26), NOW)).toEqual({ text: 'Today 11:59 PM', overdue: false });
    expect(dueLabel(at(26, 9, 0), NOW)).toEqual({ text: 'Today 9 AM', overdue: true });
    expect(dueLabel(at(27), NOW).text).toBe('Tomorrow');
    expect(dueLabel(at(27, 17, 0), NOW).text).toBe('Tomorrow 5 PM');
    expect(dueLabel(at(30), NOW).text).toBe('Fri');
    expect(dueLabel(at(30, 11, 0), NOW).text).toBe('Fri 11 AM');
    expect(dueLabel(at(3, 23, 59, 10), NOW).text).toBe('Nov 3');
    expect(dueLabel(at(25), NOW)).toEqual({ text: 'Yesterday', overdue: true });
    expect(dueLabel(at(24), NOW)).toEqual({ text: '2 days ago', overdue: true });
  });

  it('doDateLabel', () => {
    expect(doDateLabel('2026-10-26', NOW)).toBe('Today');
    expect(doDateLabel('2026-10-28', NOW)).toBe('Wed');
    expect(doDateLabel('2026-11-20', NOW)).toBe('Nov 20');
  });

  it('formatDuration', () => {
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(25 * 60_000)).toBe('25m');
    expect(formatDuration(65 * 60_000)).toBe('1h 5m');
    expect(formatDuration(120 * 60_000)).toBe('2h');
  });

  it('openLinkLabel', () => {
    expect(openLinkLabel('https://canvas.ucsd.edu/courses/1')).toBe('Open in Canvas');
    expect(openLinkLabel('https://www.gradescope.com/courses/1')).toBe('Open in Gradescope');
    expect(openLinkLabel('https://us.prairielearn.com/pl/course_instance/1')).toBe('Open in PrairieLearn');
    expect(openLinkLabel('https://example.com')).toBe('Open link');
    expect(openLinkLabel('not a url')).toBe('Open link');
  });
});

describe('relativeDue', () => {
  const now = new Date(2026, 9, 26, 12);
  it('uses short labels within a week and day counts beyond', () => {
    expect(relativeDue(new Date(2026, 9, 30, 23, 59).toISOString(), now)).toBe('Fri');
    expect(relativeDue(new Date(2026, 10, 13, 23, 59).toISOString(), now)).toBe('in 18 days');
    expect(relativeDue(new Date(2026, 9, 24, 23, 59).toISOString(), now)).toBe('2 days ago');
  });
});
