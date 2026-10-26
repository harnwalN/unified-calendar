// Shared task/class helpers: course → class matching and the unified task list.
import { useEffect, useMemo } from 'react';
import { format, startOfDay } from 'date-fns';
import { PALETTE } from '../config';
import type { CalEvent, ClassInfo, PersonalTask, TaskMeta, TaskView, TimeEntry } from '../types';
import { taskRef, useStore } from './index';
import { useAllEvents } from './selectors';

/** Normalized key for comparing course strings across sources ("cse 110 " → "CSE 110"). */
export function normalizeCourse(course: string): string {
  return course.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Short course code used to auto-group sources: "CSE 110 - Lecture A00 (FA26)", "CSE110",
 * "cse 110" → "CSE 110"; Canvas SIS codes like "MCWP040_FA26_017" → "MCWP 40".
 * Falls back to the normalized string.
 */
export function courseCode(course: string): string {
  const n = normalizeCourse(course);
  const m = n.match(/^([A-Z]{2,5})[\s_-]*0*(\d{1,4}[A-Z]{0,2})(?=$|[^A-Z0-9])/);
  return m ? `${m[1]} ${m[2]}` : n;
}

/** The live (non-deleted) class a course string belongs to, if any. */
export function findClassForCourse(classes: Record<string, ClassInfo>, course: string): ClassInfo | undefined {
  const norm = normalizeCourse(course);
  const code = courseCode(course);
  const live = Object.values(classes).filter((c) => !c.deleted);
  return (
    live.find((c) => c.aliases.includes(norm)) ??
    live.find((c) => c.aliases.some((a) => courseCode(a) === code))
  );
}

/** True when the user deleted the class this course belonged to (so it isn't auto-created again). */
export function isDeletedCourse(classes: Record<string, ClassInfo>, course: string): boolean {
  const norm = normalizeCourse(course);
  const code = courseCode(course);
  return Object.values(classes).some(
    (c) => c.deleted && c.aliases.some((a) => a === norm || courseCode(a) === code),
  );
}

/** Live classes in display order. */
export function useClasses(): ClassInfo[] {
  const classes = useStore((s) => s.classes);
  return useMemo(
    () => Object.values(classes).filter((c) => !c.deleted).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [classes],
  );
}

/**
 * Mount once in <App/>: creates a class for every assignment course that doesn't map
 * to one yet, and records new alias spellings on the matching class.
 */
export function useAutoClasses(): void {
  const events = useAllEvents();
  useEffect(() => {
    const courses = new Set(events.filter((e) => e.course).map((e) => e.course!));
    if (!courses.size) return;
    const { classes, addClass, updateClass } = useStore.getState();
    let snapshot = classes;
    for (const course of courses) {
      const norm = normalizeCourse(course);
      const match = findClassForCourse(snapshot, course);
      if (match) {
        if (!match.aliases.includes(norm)) updateClass(match.id, { aliases: [...match.aliases, norm] });
        // Classes auto-named with a raw course string before courseCode understood it get the short name.
        else if (match.name === norm && courseCode(course) !== norm) updateClass(match.id, { name: courseCode(course) });
      } else if (!isDeletedCourse(snapshot, course)) {
        const used = Object.values(snapshot).filter((c) => !c.deleted).length;
        addClass({ name: courseCode(course), color: PALETTE[used % PALETTE.length], aliases: [norm] });
      }
      snapshot = useStore.getState().classes;
    }
  }, [events]);
}

/** Local day key used for do-dates and daily stats. */
export const dayKey = (d: Date | string | number) => format(new Date(d), 'yyyy-MM-dd');

/** Total ms of finished entries per task, overall and for today. Exported for tests. */
export function timeTotals(entries: Record<string, TimeEntry>, now = new Date()) {
  const todayStart = startOfDay(now).getTime();
  const total = new Map<string, number>();
  const today = new Map<string, number>();
  for (const e of Object.values(entries)) {
    if (e.deleted) continue;
    const s = Date.parse(e.start);
    const end = Date.parse(e.end);
    if (!(end > s)) continue;
    total.set(e.taskRef, (total.get(e.taskRef) ?? 0) + end - s);
    const overlap = end - Math.max(s, todayStart);
    if (overlap > 0) today.set(e.taskRef, (today.get(e.taskRef) ?? 0) + overlap);
  }
  return { total, today };
}

/** Pure builder behind `useTasks()`. Exported for tests. */
export function buildTaskViews(
  events: CalEvent[],
  meta: Record<string, TaskMeta>,
  tasks: Record<string, PersonalTask>,
  classes: Record<string, ClassInfo>,
  entries: Record<string, TimeEntry>,
  now = new Date(),
): TaskView[] {
  const { total, today } = timeTotals(entries, now);
  const views: TaskView[] = [];
  const seen = new Set<string>();

  for (const e of events) {
    if (e.kind !== 'assignment' || seen.has(e.uid)) continue;
    seen.add(e.uid);
    const ref = taskRef.assignment(e.uid);
    const m = meta[e.uid];
    views.push({
      ref,
      source: 'assignment',
      list: 'class',
      title: e.title,
      classId: e.course ? findClassForCourse(classes, e.course)?.id : undefined,
      due: e.start,
      url: e.url,
      course: e.course,
      calendarId: e.calendarId,
      status: m?.status ?? 'todo',
      priority: m?.priority ?? 'none',
      doDate: m?.doDate,
      notes: m?.notes,
      subtasks: m?.subtasks ?? [],
      estimateMin: m?.estimateMin,
      timeTodayMs: today.get(ref) ?? 0,
      timeTotalMs: total.get(ref) ?? 0,
    });
  }

  for (const t of Object.values(tasks)) {
    if (t.deleted) continue;
    const ref = taskRef.personal(t.id);
    const classId = t.classId && classes[t.classId] && !classes[t.classId].deleted ? t.classId : undefined;
    views.push({
      ref,
      source: 'personal',
      list: t.list === 'quick' ? 'quick' : classId ? 'class' : 'personal',
      title: t.title,
      classId,
      due: t.due,
      status: t.status,
      priority: t.priority,
      doDate: t.doDate,
      notes: t.notes,
      subtasks: t.subtasks,
      estimateMin: t.estimateMin,
      timeTodayMs: today.get(ref) ?? 0,
      timeTotalMs: total.get(ref) ?? 0,
    });
  }
  return views;
}

/**
 * Every task (assignments from visible calendars + personal/quick tasks) as `TaskView`s.
 * Unsorted: the home screen decides grouping/sorting.
 */
export function useTasks(): TaskView[] {
  const events = useAllEvents();
  const calendars = useStore((s) => s.calendars);
  const meta = useStore((s) => s.meta);
  const tasks = useStore((s) => s.tasks);
  const classes = useStore((s) => s.classes);
  const timeEntries = useStore((s) => s.timeEntries);
  return useMemo(() => {
    const visible = events.filter((e) => calendars[e.calendarId]?.visible !== false);
    return buildTaskViews(visible, meta, tasks, classes, timeEntries);
  }, [events, calendars, meta, tasks, classes, timeEntries]);
}
