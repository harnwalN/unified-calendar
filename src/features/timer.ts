// Stopwatch time tracking: one running timer, logged as TimeEntries when stopped.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useAllEvents } from '../store/selectors';
import { buildTaskViews } from '../store/tasks';
import type { CalendarInfo, ClassInfo, TaskRef, TaskView } from '../types';
import { splitAtMidnight } from './timeStats';

/** Stopped timers shorter than this are discarded (accidental clicks). */
export const MIN_ENTRY_MS = 5000;
const LAST_REF_KEY = 'time:lastRef';

/** Log [start, end) for `ref`, one entry per local day it touches. Returns the new entry ids. */
export function logTime(ref: TaskRef, start: number, end: number): string[] {
  const { addTimeEntry } = useStore.getState();
  return splitAtMidnight(start, end).map(([s, e]) =>
    addTimeEntry({ taskRef: ref, start: new Date(s).toISOString(), end: new Date(e).toISOString() }),
  );
}

/** Start timing `ref`; a timer already running for another task is stopped and logged first. */
export function startTimer(ref: TaskRef): void {
  stopTimer();
  useStore.getState().setRunningTimer({ taskRef: ref, start: new Date().toISOString() });
  rememberLastRef(ref);
}

/** Stop the running timer (if any) and log its time entry. */
export function stopTimer(): void {
  const { runningTimer, setRunningTimer } = useStore.getState();
  if (!runningTimer) return;
  setRunningTimer(null);
  const start = Date.parse(runningTimer.start);
  const end = Date.now();
  if (end - start >= MIN_ENTRY_MS) logTime(runningTimer.taskRef, start, end);
}

/** Start `ref`, or stop it if it is the one running. */
export function toggleTimer(ref: TaskRef): void {
  if (useStore.getState().runningTimer?.taskRef === ref) stopTimer();
  else startTimer(ref);
}

/** Live elapsed ms of the running timer (only if it is timing `ref`, when given); ticks every second. */
export function useRunningElapsed(ref?: TaskRef): number {
  const timer = useStore((s) => s.runningTimer);
  const active = timer && (!ref || timer.taskRef === ref) ? timer : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return active ? Math.max(0, now - Date.parse(active.start)) : 0;
}

function rememberLastRef(ref: TaskRef) {
  try {
    localStorage.setItem(LAST_REF_KEY, ref);
  } catch {
    /* storage unavailable */
  }
}

/** The task most recently timed on this device (for Shift+Space resume). */
export function lastTimedRef(): TaskRef | null {
  try {
    const v = localStorage.getItem(LAST_REF_KEY);
    return v && /^[at]:/.test(v) ? (v as TaskRef) : null;
  } catch {
    return null;
  }
}

/** Stop the running timer, or resume the last-timed task. */
export function stopOrResume(): void {
  if (useStore.getState().runningTimer) stopTimer();
  else {
    const ref = lastTimedRef();
    if (ref) startTimer(ref);
  }
}

// ---------------------------------------------------------------------------
// Resolving a TaskRef to something displayable.
// ---------------------------------------------------------------------------

export interface TaskLabel {
  title: string;
  /** Stats group: class id, 'personal', 'quick' or 'deleted'. */
  groupKey: string;
  groupName: string;
  /** CSS color for the group's marks. */
  color: string;
  deleted: boolean;
  task?: TaskView;
}

/** Colors for groups without a class; CSS variables so they follow the theme. */
export const GROUP_COLORS = { personal: 'var(--primary)', quick: 'var(--text-3)', deleted: 'var(--border)' };

/** Pure: label for `ref` given a task index (see `useTaskIndex`). */
export function taskLabel(
  ref: TaskRef,
  index: Map<TaskRef, TaskView>,
  classes: Record<string, ClassInfo>,
  calendars: Record<string, CalendarInfo> = {},
): TaskLabel {
  const task = index.get(ref);
  if (!task) {
    return { title: 'Deleted task', groupKey: 'deleted', groupName: 'Deleted tasks', color: GROUP_COLORS.deleted, deleted: true };
  }
  const cls = task.classId ? classes[task.classId] : undefined;
  if (cls && !cls.deleted) {
    return { title: task.title, groupKey: cls.id, groupName: cls.name, color: cls.color, deleted: false, task };
  }
  if (task.course) {
    // Assignment whose class hasn't been created yet: group by course, colored like its calendar.
    const color = (task.calendarId && calendars[task.calendarId]?.color) || GROUP_COLORS.personal;
    return { title: task.title, groupKey: `course:${task.course}`, groupName: task.course, color, deleted: false, task };
  }
  const quick = task.list === 'quick';
  return {
    title: task.title,
    groupKey: quick ? 'quick' : 'personal',
    groupName: quick ? 'Quick' : 'Personal',
    color: quick ? GROUP_COLORS.quick : GROUP_COLORS.personal,
    deleted: false,
    task,
  };
}

/**
 * Every task by ref, including assignments on hidden calendars (time logged on them
 * still counts) — unlike `useTasks()`, which only lists visible ones.
 */
export function useTaskIndex(): Map<TaskRef, TaskView> {
  const events = useAllEvents();
  const meta = useStore((s) => s.meta);
  const tasks = useStore((s) => s.tasks);
  const classes = useStore((s) => s.classes);
  const timeEntries = useStore((s) => s.timeEntries);
  return useMemo(
    () => new Map(buildTaskViews(events, meta, tasks, classes, timeEntries).map((t) => [t.ref, t])),
    [events, meta, tasks, classes, timeEntries],
  );
}

/** Bound `taskLabel` for components: `const label = useTaskLabeler(); label(ref)`. */
export function useTaskLabeler(): (ref: TaskRef) => TaskLabel {
  const index = useTaskIndex();
  const classes = useStore((s) => s.classes);
  const calendars = useStore((s) => s.calendars);
  return useMemo(() => {
    const cache = new Map<TaskRef, TaskLabel>();
    return (ref: TaskRef) => {
      let l = cache.get(ref);
      if (!l) cache.set(ref, (l = taskLabel(ref, index, classes, calendars)));
      return l;
    };
  }, [index, classes, calendars]);
}

/** Title + class for one ref ("Deleted task" if it no longer exists). */
export function useTaskTitle(ref: TaskRef | null | undefined): TaskLabel | null {
  const label = useTaskLabeler();
  return ref ? label(ref) : null;
}
