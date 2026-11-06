import { describe, expect, it } from 'vitest';
import type { TaskView } from '../../types';
import { autoPlan, blocksOnDay, freeIntervals, freeMinutesIn, mergeIntervals, nextFreeStart, planCandidates, suggestedMinutes, type PlanItem } from './planning';

// Monday, Oct 26 2026, 2:00 PM local.
const NOW = new Date(2026, 9, 26, 14, 0);
const t = (h: number, m = 0, d = 26) => new Date(2026, 9, d, h, m).getTime();
const iso = (h: number, m = 0, d = 26) => new Date(t(h, m, d)).toISOString();
const MIN = 60_000;

let n = 0;
function task(p: Partial<TaskView>): TaskView {
  const id = `x${n++}`;
  return { ref: `t:${id}`, source: 'personal', list: 'personal', title: id, status: 'todo', priority: 'none', subtasks: [], timeTodayMs: 0, timeTotalMs: 0, ...p };
}
const item = (minutes: number, key = `k${n++}`): PlanItem => ({ key, task: task({}), title: key, minutes });

describe('free time', () => {
  it('merges overlapping busy spans', () => {
    expect(mergeIntervals([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 6 }])).toEqual([{ start: 1, end: 8 }]);
  });

  it('finds gaps on the 15-minute grid around events', () => {
    const busy = [{ start: t(15), end: t(15, 50) }, { start: t(17), end: t(18) }];
    expect(freeIntervals(busy, t(14, 5), t(19))).toEqual([
      { start: t(14, 15), end: t(15) },
      { start: t(16), end: t(17) },
      { start: t(18), end: t(19) },
    ]);
    expect(freeMinutesIn(busy, t(14, 5), t(19))).toBe(45 + 60 + 60);
  });

  it('picks the first gap long enough', () => {
    const busy = [{ start: t(15), end: t(16) }];
    expect(nextFreeStart(busy, t(14), t(22), 90)).toBe(t(16));
    expect(nextFreeStart(busy, t(14), t(22), 60)).toBe(t(14));
    expect(nextFreeStart(busy, t(14), t(15, 30), 90)).toBeNull();
  });
});

describe('autoPlan', () => {
  it('fills free time in order, with a break before each session, and skips what does not fit', () => {
    const busy = [{ start: t(15), end: t(16) }];
    const a = item(60, 'a');
    const b = item(30, 'b');
    const c = item(120, 'c');
    const placed = autoPlan([a, b, c], busy, t(14), t(17, 30));
    expect(placed.map((p) => [p.item.key, (p.start - t(14)) / MIN])).toEqual([
      ['a', 0],
      ['b', 135],
    ]);
    // With the evening free too, the long one goes after the others.
    const all = autoPlan([a, b, c], busy, t(14), t(22));
    expect(all.map((p) => [p.item.key, (p.start - t(14)) / MIN])).toEqual([
      ['a', 0],
      ['b', 135],
      ['c', 180],
    ]);
  });
});

describe('planCandidates', () => {
  it('lists today’s tasks and subtasks, including missed ones; other days by do-date or due date', () => {
    const today = task({ title: 'today', doDate: '2026-10-26', estimateMin: 90 });
    const parent = task({
      title: 'midterm',
      due: iso(18, 0, 30),
      estimateMin: 240,
      subtasks: [
        { id: 's1', title: 'review', done: false, doDate: '2026-10-25' },
        { id: 's2', title: 'practice', done: false, doDate: '2026-10-27' },
        { id: 's3', title: 'sheet', done: true, doDate: '2026-10-26' },
        { id: 's4', title: 'undated', done: false },
      ],
    });
    const due28 = task({ title: 'due28', due: iso(23, 59, 28) });
    const done = task({ title: 'done', doDate: '2026-10-26', status: 'done' });
    const tasks = [today, parent, due28, done];

    expect(planCandidates(tasks, '2026-10-26', NOW).map((c) => [c.title, c.minutes])).toEqual([
      ['today', 90],
      ['review', 60],
    ]);
    expect(planCandidates(tasks, '2026-10-27', NOW).map((c) => c.title)).toEqual(['practice']);
    expect(planCandidates(tasks, '2026-10-28', NOW).map((c) => c.title)).toEqual(['due28']);
  });

  it('suggests the estimate (split across subtasks), capped at 2 h, else 30 min', () => {
    expect(suggestedMinutes(task({}))).toBe(30);
    expect(suggestedMinutes(task({ estimateMin: 200 }))).toBe(120);
    const p = task({ estimateMin: 100, subtasks: [{ id: 'a', title: 'a', done: false }, { id: 'b', title: 'b', done: false }] });
    expect(suggestedMinutes(p, 'a')).toBe(45);
  });

  it('finds a day’s blocks, per subtask when asked', () => {
    const tk = task({
      blocks: [
        { id: '1', start: iso(9), durationMin: 30 },
        { id: '2', start: iso(10), durationMin: 30, subtaskId: 's' },
        { id: '3', start: iso(9, 0, 27), durationMin: 30 },
      ],
    });
    expect(blocksOnDay(tk, '2026-10-26').map((b) => b.id)).toEqual(['1', '2']);
    expect(blocksOnDay(tk, '2026-10-26', 's').map((b) => b.id)).toEqual(['2']);
  });
});
