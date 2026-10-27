// Per-day data for the planner timelines: timed events, all-day events, deadlines and tracked time.
import { useCallback, useMemo } from 'react';
import { addDays, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import { useTasks } from '../../store/tasks';
import { PLANNED_CALENDAR_ID, useVisibleEvents } from '../../store/selectors';
import { useTaskLabeler } from '../../features/timer';
import type { CalEvent, TaskRef, TaskView } from '../../types';
import { useClassMatcher } from '../../features/classMeetings';
import { eventColors, type Span } from './timeline';

export interface EventSpan extends Span {
  event: CalEvent;
  color: string;
  planned: boolean;
  /** Name of the class this event is a meeting of (lecture, lab…), if any. */
  className?: string;
}

export interface TrackedSpan extends Span {
  ref: TaskRef;
  color: string;
  title: string;
}

export type DueTask = TaskView & { due: string };

export interface DayData {
  /** Local midnight (ms). */
  day: number;
  end: number;
  spans: EventSpan[];
  allDay: CalEvent[];
  due: DueTask[];
  tracked: TrackedSpan[];
}

/** Returns `dayData(date)` for any day; recomputes when events, tasks, time or `now` change. */
export function usePlannerData(now: number): (date: Date | number) => DayData {
  const events = useVisibleEvents();
  const tasks = useTasks();
  const calendars = useStore((s) => s.calendars);
  const entries = useStore((s) => s.timeEntries);
  const timer = useStore((s) => s.runningTimer);
  const label = useTaskLabeler();
  const match = useClassMatcher();

  const prepared = useMemo(() => {
    const timed: EventSpan[] = [];
    const allDay: CalEvent[] = [];
    for (const e of events) {
      if (e.kind === 'assignment') continue;
      if (e.allDay) {
        allDay.push(e);
        continue;
      }
      const planned = e.calendarId === PLANNED_CALENDAR_ID;
      timed.push({
        id: e.id,
        start: Date.parse(e.start),
        end: Math.max(Date.parse(e.end), Date.parse(e.start) + 60_000),
        event: e,
        planned,
        color: calendars[e.calendarId]?.color ?? '#0b8043',
      });
    }
    // Scheduled work keeps its green; everything else gets a varied per-event color.
    const colors = eventColors(timed.filter((t) => !t.planned).map((t) => ({ id: t.id, title: t.event.title, start: t.start, end: t.end })));
    for (const t of timed) {
      // Class meetings wear their class color so lectures read as "CSE 110" at a glance.
      const m = t.planned ? null : match(t.event);
      t.color = m ? m.cls.color : (colors.get(t.id) ?? t.color);
      if (m) t.className = m.cls.name;
    }
    const due = tasks.filter((t): t is DueTask => t.status !== 'done' && !!t.due);
    const tracked: TrackedSpan[] = Object.values(entries)
      .filter((e) => !e.deleted)
      .map((e) => {
        const l = label(e.taskRef);
        return { id: e.id, ref: e.taskRef, start: Date.parse(e.start), end: Date.parse(e.end), color: l.color, title: l.title };
      });
    if (timer) {
      const l = label(timer.taskRef);
      tracked.push({ id: 'running', ref: timer.taskRef, start: Date.parse(timer.start), end: now, color: l.color, title: l.title });
    }
    return { timed, allDay, due, tracked };
  }, [events, tasks, calendars, entries, timer, label, match, now]);

  return useCallback(
    (date: Date | number) => {
      const day = startOfDay(date).getTime();
      const end = addDays(day, 1).getTime();
      const clip = <T extends Span>(s: T): T => ({ ...s, start: Math.max(s.start, day), end: Math.min(s.end, end) });
      return {
        day,
        end,
        spans: prepared.timed.filter((s) => s.end > day && s.start < end).map(clip),
        allDay: prepared.allDay.filter((e) => Date.parse(e.start) < end && Date.parse(e.end) > day),
        due: prepared.due.filter((t) => Date.parse(t.due) >= day && Date.parse(t.due) < end),
        tracked: prepared.tracked.filter((s) => s.end > day && s.start < end).map(clip),
      };
    },
    [prepared],
  );
}
