import { useMemo } from 'react';
import { useStore } from './index';
import type { CalEvent } from '../types';

/** All events from every source, flattened. */
export function useAllEvents(): CalEvent[] {
  const eventsBySource = useStore((s) => s.eventsBySource);
  return useMemo(() => Object.values(eventsBySource).flat(), [eventsBySource]);
}

/**
 * Events that should be drawn: calendar visible, matches search,
 * and (if hideCompleted) not checked off. Sorted by start.
 */
export function useVisibleEvents(): CalEvent[] {
  const all = useAllEvents();
  const calendars = useStore((s) => s.calendars);
  const search = useStore((s) => s.search);
  const done = useStore((s) => s.done);
  const hideCompleted = useStore((s) => s.settings.hideCompleted);

  return useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((e) => calendars[e.calendarId]?.visible !== false)
      .filter((e) => !(hideCompleted && e.kind === 'assignment' && done[e.uid]))
      .filter(
        (e) =>
          !q ||
          e.title.toLowerCase().includes(q) ||
          e.course?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [all, calendars, search, done, hideCompleted]);
}

/** Color for an event (falls back to Google blue). */
export function useCalendarColor(calendarId: string): string {
  return useStore((s) => s.calendars[calendarId]?.color ?? '#1a73e8');
}
