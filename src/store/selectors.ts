import { useMemo } from 'react';
import { useStore } from './index';
import type { CalEvent, PersonalTask, TaskMeta, TaskRef } from '../types';

/** All events from every source (synced feeds + imported sources), flattened. */
export function useAllEvents(): CalEvent[] {
  const eventsBySource = useStore((s) => s.eventsBySource);
  const imports = useStore((s) => s.imports);
  return useMemo(
    () => [
      ...Object.values(eventsBySource).flat(),
      ...Object.values(imports).flatMap((i) => (i.deleted ? [] : i.events)),
    ],
    [eventsBySource, imports],
  );
}

/**
 * Events that should be drawn: calendar visible, matches search,
 * and (if hideCompleted) not checked off. Sorted by start.
 */
export function useVisibleEvents(): CalEvent[] {
  const feedEvents = useAllEvents();
  const meta = useStore((s) => s.meta);
  const tasks = useStore((s) => s.tasks);
  const all = useMemo(() => [...feedEvents, ...plannedEvents(feedEvents, meta, tasks)], [feedEvents, meta, tasks]);
  const calendars = useStore((s) => s.calendars);
  const search = useStore((s) => s.search);
  const hideCompleted = useStore((s) => s.settings.hideCompleted);

  return useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((e) => calendars[e.calendarId]?.visible !== false)
      .filter((e) => !(hideCompleted && e.kind === 'assignment' && meta[e.uid]?.status === 'done'))
      .filter(
        (e) =>
          !q ||
          e.title.toLowerCase().includes(q) ||
          e.course?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [all, calendars, search, meta, hideCompleted]);
}

/** Color for an event (falls back to Google blue). */
export function useCalendarColor(calendarId: string): string {
  return useStore((s) => s.calendars[calendarId]?.color ?? (calendarId === PLANNED_CALENDAR_ID ? '#0b8043' : '#1a73e8'));
}

/** Calendar id used for scheduled work blocks. */
export const PLANNED_CALENDAR_ID = 'planned';
const PLAN_PREFIX = 'plan:';

/** Which task a planned-block event id belongs to (`plan:<taskRef>:<blockId>`), if any. */
export function plannedTaskRef(eventId: string): TaskRef | null {
  if (!eventId.startsWith(PLAN_PREFIX)) return null;
  return eventId.slice(PLAN_PREFIX.length, eventId.lastIndexOf(':')) as TaskRef;
}

/** Scheduled work blocks of every live task as calendar events. Exported for tests. */
export function plannedEvents(
  events: CalEvent[],
  meta: Record<string, TaskMeta>,
  tasks: Record<string, PersonalTask>,
): CalEvent[] {
  const out: CalEvent[] = [];
  const add = (ref: TaskRef, title: string, blocks: TaskMeta['blocks'], done: boolean) => {
    for (const b of blocks ?? []) {
      const id = `${PLAN_PREFIX}${ref}:${b.id}`;
      out.push({
        id,
        uid: id,
        calendarId: PLANNED_CALENDAR_ID,
        title: done ? `✓ ${title}` : title,
        start: b.start,
        end: new Date(Date.parse(b.start) + b.durationMin * 60_000).toISOString(),
        allDay: false,
        kind: 'event',
      });
    }
  };
  const titles = new Map(events.filter((e) => e.kind === 'assignment').map((e) => [e.uid, e.title]));
  for (const m of Object.values(meta)) {
    const title = titles.get(m.uid);
    if (!m.deleted && m.blocks?.length && title) add(`a:${m.uid}`, title, m.blocks, m.status === 'done');
  }
  for (const t of Object.values(tasks)) {
    if (!t.deleted && t.blocks?.length) add(`t:${t.id}`, t.title, t.blocks, t.status === 'done');
  }
  return out;
}
