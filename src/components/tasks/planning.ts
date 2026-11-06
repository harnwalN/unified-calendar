// Pure helpers behind "Plan my day": what's worth scheduling on a day, free time around events,
// and fitting work sessions (WorkBlocks) into it.
import type { TaskView, WorkBlock } from '../../types';
import { dayKey } from '../../store/tasks';
import { isTodayTask } from './grouping';

const MIN = 60_000;
/** Scheduling grid: start times snap to quarter hours. */
export const SLOT_MIN = 15;
export const PLAN_DURATIONS = [15, 30, 45, 60, 90, 120, 180];
/** Breathing room "Fit into free time" leaves before each session. */
const BREAK_MIN = 5;

/** Something you can put on the day: a task, or one of its subtasks. */
export interface PlanItem {
  /** `ref` for a task, `ref/subtaskId` for a subtask. */
  key: string;
  task: TaskView;
  subtaskId?: string;
  title: string;
  /** Suggested session length. */
  minutes: number;
}

export interface Interval {
  start: number;
  end: number;
}

const roundTo = (min: number, step: number) => Math.max(step, Math.round(min / step) * step);

/** Session length to suggest: the estimate (whole task, or split across its subtasks), else 30 min; at most 2 h. */
export function suggestedMinutes(task: TaskView, subtaskId?: string): number {
  if (!task.estimateMin) return 30;
  const share = subtaskId && task.subtasks.length > 1 ? task.estimateMin / task.subtasks.length : task.estimateMin;
  return Math.min(120, roundTo(share, SLOT_MIN));
}

/** Blocks of `task` that start on `day` (`yyyy-MM-dd`), optionally only those for one subtask. */
export function blocksOnDay(task: TaskView, day: string, subtaskId?: string): WorkBlock[] {
  return (task.blocks ?? []).filter((b) => dayKey(b.start) === day && (subtaskId === undefined || b.subtaskId === subtaskId));
}

/**
 * Open tasks and subtasks that belong to `day`: for today, the Today list plus subtasks planned
 * for today (or missed earlier); for other days, tasks planned or due then and that day's subtasks.
 */
export function planCandidates(tasks: TaskView[], day: string, now: Date): PlanItem[] {
  const today = day === dayKey(now);
  const out: PlanItem[] = [];
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const onDay = today ? isTodayTask(t, now) : t.doDate === day || (!!t.due && dayKey(t.due) === day);
    if (onDay) out.push({ key: t.ref, task: t, title: t.title, minutes: suggestedMinutes(t) });
    for (const s of t.subtasks) {
      if (s.done || !s.doDate || (today ? s.doDate > day : s.doDate !== day)) continue;
      out.push({ key: `${t.ref}/${s.id}`, task: t, subtaskId: s.id, title: s.title, minutes: suggestedMinutes(t, s.id) });
    }
  }
  return out;
}

/** Sorted, merged busy intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

const ceilToSlot = (t: number) => Math.ceil(t / (SLOT_MIN * MIN)) * SLOT_MIN * MIN;

/** Free stretches in [from, until) around `busy`, each starting on the 15-minute grid. */
export function freeIntervals(busy: Interval[], from: number, until: number): Interval[] {
  const out: Interval[] = [];
  let cursor = ceilToSlot(from);
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= until) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, until) });
    cursor = Math.max(cursor, ceilToSlot(b.end));
  }
  if (cursor < until) out.push({ start: cursor, end: until });
  return out.filter((i) => i.end - i.start >= SLOT_MIN * MIN);
}

/** Earliest start ≥ `from` (on the grid) where `minutes` fits before `until`, else null. */
export function nextFreeStart(busy: Interval[], from: number, until: number, minutes: number): number | null {
  return freeIntervals(busy, from, until).find((i) => i.end - i.start >= minutes * MIN)?.start ?? null;
}

/**
 * Greedily fit `items` into free time, in order, with a short break before each session.
 * Returns where each placed item goes; items that don't fit are left out.
 */
export function autoPlan(items: PlanItem[], busy: Interval[], from: number, until: number): { item: PlanItem; start: number }[] {
  const taken = [...busy];
  const out: { item: PlanItem; start: number }[] = [];
  for (const item of items) {
    const padded = taken.map((b) => ({ start: b.start, end: b.end + BREAK_MIN * MIN }));
    const start = nextFreeStart(padded, from, until, item.minutes);
    if (start === null) continue;
    out.push({ item, start });
    taken.push({ start, end: start + item.minutes * MIN });
  }
  return out;
}

/** Total free minutes in [from, until). */
export const freeMinutesIn = (busy: Interval[], from: number, until: number) =>
  freeIntervals(busy, from, until).reduce((sum, i) => sum + (i.end - i.start) / MIN, 0);
