// Pure home-screen logic: which section each task lands in, ordering, weekly progress,
// free time before the next event, and per-day load for the week strip.
import { addDays, startOfDay, startOfWeek } from 'date-fns';
import type { CalEvent, ClassInfo, Priority, Subtask, TaskView } from '../../types';
import { dayKey } from '../../store/tasks';

/** Not-done assignments overdue by more than this many days drop out of Today (stale feed items). */
export const STALE_DAYS = 14;
/** Quick items without an estimate are assumed to take this long. */
export const DEFAULT_QUICK_MIN = 10;
/** "Got N min?" never promises more than this. */
export const MAX_GAP_MIN = 180;

export interface TaskGroup {
  open: TaskView[];
  done: TaskView[];
}

export interface ClassSection extends TaskGroup {
  /** Class id, or 'other' for assignments without a class. */
  id: string;
  name: string;
  color?: string;
  /** Not-done assignments overdue past `STALE_DAYS`, collapsed separately. */
  stale: TaskView[];
  /** Tasks of this class shown in Today instead. */
  inToday: number;
  weekDone: number;
  weekTotal: number;
  /** Not-done tasks past due (including stale ones and those shown in Today). */
  overdue: number;
}

/** A dated subtask shown as its own item (Today, the planner's day view), with its parent task. */
export interface SubtaskItem {
  parent: TaskView;
  sub: Subtask & { doDate: string };
}

export interface HomeSections {
  today: TaskView[];
  /** Open subtasks planned for today or earlier whose parent isn't in Today itself (it lists them nested). */
  todaySubtasks: SubtaskItem[];
  classes: ClassSection[];
  personal: TaskGroup;
  quick: TaskGroup;
  /** Not-done tasks anywhere (0 → "all caught up"). */
  openCount: number;
  dueTodayCount: number;
  overdueCount: number;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2, none: 3 };

/** Due ascending (no due last), then priority, then title. */
export function compareTasks(a: TaskView, b: TaskView): number {
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title);
}

/** Most recently due first (for the collapsed Completed list). */
const compareDoneTasks = (a: TaskView, b: TaskView) => -compareTasks(a, b);

export function isOverdue(t: Pick<TaskView, 'due' | 'status'>, now: Date): boolean {
  return t.status !== 'done' && !!t.due && Date.parse(t.due) < now.getTime();
}

/** Today: not done and overdue (recently), due today, planned (do-date) for today or earlier, or scheduled today. */
export function isTodayTask(t: TaskView, now: Date): boolean {
  if (t.status === 'done') return false;
  const today = dayKey(now);
  if (t.doDate && t.doDate <= today) return true;
  if (t.blocks?.some((b) => dayKey(b.start) === today)) return true;
  if (!t.due) return false;
  const due = Date.parse(t.due);
  if (due >= addDays(startOfDay(now), 1).getTime()) return false;
  return !isStale(t, now);
}

function isStale(t: TaskView, now: Date): boolean {
  return (
    t.source === 'assignment' &&
    t.status !== 'done' &&
    !!t.due &&
    Date.parse(t.due) < startOfDay(now).getTime() - STALE_DAYS * 86_400_000
  );
}

function emptyClassSection(id: string, name: string, color?: string): ClassSection {
  return { id, name, color, open: [], done: [], stale: [], inToday: 0, weekDone: 0, weekTotal: 0, overdue: 0 };
}

/**
 * Split tasks into home-screen sections. A task in Today appears only there; its class
 * header counts it in `inToday`. Classes keep `classes` order; hidden classes (and their
 * tasks) are left out; assignments without a class go to a trailing "Other" section.
 */
export function groupTasks(tasks: TaskView[], classes: ClassInfo[], now: Date, weekStartsOn: 0 | 1 = 0): HomeSections {
  const weekStart = startOfWeek(now, { weekStartsOn }).getTime();
  const weekEnd = addDays(weekStart, 7).getTime();
  const live = classes.filter((c) => !c.deleted);
  const hidden = new Set(live.filter((c) => c.hidden).map((c) => c.id));
  const byClass = new Map(live.filter((c) => !c.hidden).map((c) => [c.id, emptyClassSection(c.id, c.name, c.color)]));
  const other = emptyClassSection('other', 'Other');
  const out: HomeSections = {
    today: [],
    todaySubtasks: [],
    classes: [],
    personal: { open: [], done: [] },
    quick: { open: [], done: [] },
    openCount: 0,
    dueTodayCount: 0,
    overdueCount: 0,
  };
  const todayKey = dayKey(now);

  for (const t of tasks) {
    if (t.classId && hidden.has(t.classId)) continue;
    const cls = t.list === 'class' ? (t.classId && byClass.get(t.classId)) || other : undefined;
    const section: TaskGroup = cls ?? (t.list === 'quick' ? out.quick : out.personal);
    const done = t.status === 'done';
    const overdue = isOverdue(t, now);

    if (!done) {
      out.openCount++;
      if (overdue) out.overdueCount++;
      else if (t.due && dayKey(t.due) === todayKey) out.dueTodayCount++;
    }
    if (cls) {
      if (overdue) cls.overdue++;
      if (t.due) {
        const due = Date.parse(t.due);
        if (due >= weekStart && due < weekEnd) {
          cls.weekTotal++;
          if (done) cls.weekDone++;
        }
      }
    }

    if (isTodayTask(t, now)) {
      out.today.push(t);
      if (cls) cls.inToday++;
      continue;
    }
    if (!done) {
      for (const sub of t.subtasks) {
        if (!sub.done && sub.doDate && sub.doDate <= todayKey) out.todaySubtasks.push({ parent: t, sub: { ...sub, doDate: sub.doDate } });
      }
    }
    if (done) section.done.push(t);
    else if (cls && isStale(t, now)) cls.stale.push(t);
    else section.open.push(t);
  }

  // Overdue first, then the normal order.
  out.today.sort((a, b) => Number(isOverdue(b, now)) - Number(isOverdue(a, now)) || compareTasks(a, b));
  // Missed days first, then by the parent's deadline; a parent's subtasks keep their own order.
  out.todaySubtasks.sort((a, b) => (a.sub.doDate < b.sub.doDate ? -1 : a.sub.doDate > b.sub.doDate ? 1 : 0) || compareTasks(a.parent, b.parent));
  const finish = (g: TaskGroup) => {
    g.open.sort(compareTasks);
    g.done.sort(compareDoneTasks);
  };
  for (const s of [...byClass.values(), other]) {
    finish(s);
    s.stale.sort(compareDoneTasks);
  }
  finish(out.personal);
  finish(out.quick);

  out.classes = [...byClass.values()];
  const otherUsed = other.open.length + other.done.length + other.stale.length + other.inToday;
  if (otherUsed) out.classes.push(other);
  return out;
}

/** Every subtask planned for `day` (`yyyy-MM-dd`), done or not, in parent-deadline order. */
export function subtasksOnDay(tasks: TaskView[], day: string): SubtaskItem[] {
  const out: SubtaskItem[] = [];
  for (const t of [...tasks].sort(compareTasks)) {
    for (const sub of t.subtasks) if (sub.doDate === day) out.push({ parent: t, sub: { ...sub, doDate: sub.doDate } });
  }
  return out;
}

/**
 * Minutes until the next timed (non-deadline) event that starts later today, capped at
 * `MAX_GAP_MIN`. 0 while an event is in progress and the next starts right after.
 */
export function freeMinutes(events: CalEvent[], now: Date): number {
  const nowMs = now.getTime();
  const endOfDay = addDays(startOfDay(now), 1).getTime();
  let next = Math.min(endOfDay, nowMs + MAX_GAP_MIN * 60_000);
  for (const e of events) {
    if (e.allDay || e.kind === 'assignment' || e.start === e.end) continue;
    const s = Date.parse(e.start);
    if (s > nowMs && s < next) next = s;
  }
  return Math.max(0, Math.floor((next - nowMs) / 60_000));
}

export function fitsGap(t: Pick<TaskView, 'estimateMin'>, gapMin: number): boolean {
  return (t.estimateMin ?? DEFAULT_QUICK_MIN) <= gapMin;
}

export interface DayLoad {
  date: Date;
  events: number;
  tasksDue: number;
}

/** Per-day counts for the week strip: events touching the day (no deadlines) and open tasks due. */
export function dayLoads(days: Date[], events: CalEvent[], tasks: TaskView[]): DayLoad[] {
  return days.map((date) => {
    const from = startOfDay(date).getTime();
    const to = addDays(from, 1).getTime();
    let n = 0;
    for (const e of events) {
      if (e.kind === 'assignment') continue;
      const s = Date.parse(e.start);
      const en = Date.parse(e.end);
      if (s < to && (en > from || (s === en && s >= from))) n++;
    }
    const due = tasks.filter((t) => t.status !== 'done' && t.due && Date.parse(t.due) >= from && Date.parse(t.due) < to);
    return { date, events: n, tasksDue: due.length };
  });
}
