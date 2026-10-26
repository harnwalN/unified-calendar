// Pure date/layout helpers shared by the calendar views. No React, no store access.
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  format,
  isSameDay,
  isSameMonth,
  isSameYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { CalEvent, ViewMode } from '../types';

export type WeekStart = 0 | 1;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Ranges & navigation
// ---------------------------------------------------------------------------

/** Consecutive days starting at `start`. */
export function daysFrom(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** The days a day/week view shows. `narrowDays` (e.g. 3 on phones) replaces the 7-day week. */
export function visibleDays(view: 'day' | 'week', cursor: Date, weekStartsOn: WeekStart, narrowDays?: number): Date[] {
  if (view === 'day') return [startOfDay(cursor)];
  if (narrowDays) return daysFrom(startOfDay(cursor), narrowDays);
  return daysFrom(startOfWeek(cursor, { weekStartsOn }), 7);
}

/** Always 6 weeks so the grid height never jumps between months. */
export function monthGridDays(cursor: Date, weekStartsOn: WeekStart): Date[] {
  return daysFrom(startOfWeek(startOfMonth(cursor), { weekStartsOn }), 42);
}

/** Move the cursor one "page". `narrowDays` makes the week view step by that many days. */
export function stepCursor(view: ViewMode, cursor: Date, dir: 1 | -1, narrowDays?: number): Date {
  switch (view) {
    case 'day':
      return addDays(cursor, dir);
    case 'week':
      return narrowDays ? addDays(cursor, dir * narrowDays) : addWeeks(cursor, dir);
    case 'month':
      return addMonths(cursor, dir);
    case 'agenda':
      return addWeeks(cursor, dir);
  }
}

/** "October 2026", "Oct – Nov 2026" or "Dec 2026 – Jan 2027" for a run of days. */
export function rangeTitle(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (isSameMonth(first, last)) return format(first, 'MMMM yyyy');
  if (isSameYear(first, last)) return `${format(first, 'MMM')} – ${format(last, 'MMM yyyy')}`;
  return `${format(first, 'MMM yyyy')} – ${format(last, 'MMM yyyy')}`;
}

export function viewTitle(view: ViewMode, cursor: Date, weekStartsOn: WeekStart, narrowDays?: number): string {
  switch (view) {
    case 'day':
      return format(cursor, 'MMMM d, yyyy');
    case 'week':
      return rangeTitle(visibleDays('week', cursor, weekStartsOn, narrowDays));
    case 'month':
    case 'agenda':
      return format(cursor, 'MMMM yyyy');
  }
}

/** Week-day names in display order, e.g. ['Sun', 'Mon', ...]. */
export function weekdayLabels(weekStartsOn: WeekStart, pattern = 'EEE'): string[] {
  return daysFrom(startOfWeek(new Date(2026, 0, 7), { weekStartsOn }), 7).map((d) => format(d, pattern));
}

// ---------------------------------------------------------------------------
// Event geometry
// ---------------------------------------------------------------------------

/** Deadlines (e.g. Canvas assignments) have start === end. */
export function isPointEvent(e: Pick<CalEvent, 'start' | 'end'>): boolean {
  return e.start === e.end;
}

/** Events drawn in the all-day strip instead of the hourly grid. */
export function isAllDayRow(e: Pick<CalEvent, 'start' | 'end' | 'allDay'>): boolean {
  return e.allDay || Date.parse(e.end) - Date.parse(e.start) >= DAY_MS;
}

/** First and last (inclusive) calendar day the event touches, as local midnights. */
export function eventDayRange(e: Pick<CalEvent, 'start' | 'end'>): [Date, Date] {
  const s = new Date(e.start);
  const endMs = Date.parse(e.end);
  // `end` is exclusive, so an event ending exactly at midnight does not touch that day.
  const last = endMs > s.getTime() ? new Date(endMs - 1) : s;
  return [startOfDay(s), startOfDay(last)];
}

export function eventTouchesDay(e: Pick<CalEvent, 'start' | 'end'>, day: Date): boolean {
  const [first, last] = eventDayRange(e);
  const d = startOfDay(day).getTime();
  return d >= first.getTime() && d <= last.getTime();
}

/** Portion of a timed event inside `day`, in minutes from local midnight. */
export function daySegment(e: Pick<CalEvent, 'start' | 'end'>, day: Date): { startMin: number; endMin: number } | null {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  const s = Date.parse(e.start);
  const en = Date.parse(e.end);
  if (s === en) {
    if (s < dayStart || s >= dayEnd) return null;
    const m = (s - dayStart) / 60000;
    return { startMin: m, endMin: m };
  }
  const a = Math.max(s, dayStart);
  const b = Math.min(en, dayEnd);
  if (b <= a) return null;
  // Use wall-clock minutes so DST days still map onto the 24 drawn hours.
  const toMin = (ms: number) => (ms >= dayEnd ? 24 * 60 : new Date(ms).getHours() * 60 + new Date(ms).getMinutes());
  return { startMin: toMin(a), endMin: toMin(b) };
}

export interface OverlapItem {
  id: string;
  start: number;
  end: number;
}

export interface OverlapSlot {
  /** 0-based column inside its cluster. */
  col: number;
  /** Total columns in the cluster. */
  cols: number;
  /** How many columns this item may occupy (expands into free columns to its right). */
  span: number;
}

/**
 * Side-by-side layout for overlapping timed events (Google Calendar style):
 * events are grouped into clusters of transitively overlapping items, each item takes
 * the first free column, and then stretches right over columns that stay empty
 * for its whole duration. Items must have end > start (pad point events beforehand).
 */
export function layoutOverlaps(items: OverlapItem[]): Map<string, OverlapSlot> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const result = new Map<string, OverlapSlot>();

  let cluster: { item: OverlapItem; col: number }[] = [];
  let columnsEnd: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = columnsEnd.length;
    for (const { item, col } of cluster) {
      let span = 1;
      for (let c = col + 1; c < cols; c++) {
        const blocked = cluster.some((o) => o.col === c && o.item.start < item.end && item.start < o.item.end);
        if (blocked) break;
        span++;
      }
      result.set(item.id, { col, cols, span });
    }
    cluster = [];
    columnsEnd = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let col = columnsEnd.findIndex((end) => end <= item.start);
    if (col === -1) {
      col = columnsEnd.length;
      columnsEnd.push(item.end);
    } else {
      columnsEnd[col] = item.end;
    }
    cluster.push({ item, col });
    clusterEnd = cluster.length === 1 ? item.end : Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

export interface BarItem {
  id: string;
  /** Inclusive day indexes within the visible range. */
  startIdx: number;
  endIdx: number;
}

/** Stacks multi-day bars into lanes so no two bars in a lane overlap. */
export function layoutBars<T extends BarItem>(items: T[]): (T & { lane: number })[] {
  const sorted = [...items].sort(
    (a, b) => a.startIdx - b.startIdx || b.endIdx - b.startIdx - (a.endIdx - a.startIdx) || a.id.localeCompare(b.id),
  );
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end < item.startIdx);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endIdx);
    } else {
      laneEnds[lane] = item.endIdx;
    }
    return { ...item, lane };
  });
}

/** Clip an event's day range to `days`; null if it falls outside. */
export function barIndexes(e: Pick<CalEvent, 'start' | 'end'>, days: Date[]): { startIdx: number; endIdx: number } | null {
  const [first, last] = eventDayRange(e);
  const s = differenceInCalendarDays(first, days[0]);
  const en = differenceInCalendarDays(last, days[0]);
  if (en < 0 || s > days.length - 1) return null;
  return { startIdx: Math.max(0, s), endIdx: Math.min(days.length - 1, en) };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Compact grid label: "10am", "10:30pm". */
export function shortTime(d: Date): string {
  return format(d, d.getMinutes() ? 'h:mmaaa' : 'haaa');
}

/** "10:00 – 11:30 AM" or "11:00 AM – 1:00 PM". */
export function timeRange(start: Date, end: Date): string {
  const samePeriod = format(start, 'a') === format(end, 'a');
  return samePeriod
    ? `${format(start, 'h:mm')} – ${format(end, 'h:mm a')}`
    : `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
}

/** Human description of when an event happens, used by the popover. */
export function describeWhen(e: Pick<CalEvent, 'start' | 'end' | 'allDay' | 'kind'>): string {
  const s = new Date(e.start);
  const en = new Date(e.end);
  if (isPointEvent(e)) {
    return `${e.kind === 'assignment' ? 'Due ' : ''}${format(s, 'EEE, MMM d')} · ${format(s, 'h:mm a')}`;
  }
  const [first, last] = eventDayRange(e);
  if (e.allDay) {
    if (isSameDay(first, last)) return format(first, 'EEEE, MMMM d');
    return isSameYear(first, last)
      ? `${format(first, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`
      : `${format(first, 'MMM d, yyyy')} – ${format(last, 'MMM d, yyyy')}`;
  }
  if (isSameDay(first, last)) return `${format(s, 'EEEE, MMMM d')} · ${timeRange(s, en)}`;
  return `${format(s, 'MMM d, h:mm a')} – ${format(en, 'MMM d, h:mm a')}`;
}

/** Agenda time column: "All day", "Due 11:59 PM", "10:00 – 11:30 AM". */
export function agendaTime(e: Pick<CalEvent, 'start' | 'end' | 'allDay' | 'kind'>, day: Date): string {
  if (isPointEvent(e)) return `${e.kind === 'assignment' ? 'Due ' : ''}${format(new Date(e.start), 'h:mm a')}`;
  if (e.allDay) return 'All day';
  const s = new Date(e.start);
  const en = new Date(e.end);
  const [first, last] = eventDayRange(e);
  if (isSameDay(first, last)) return timeRange(s, en);
  if (isSameDay(day, first)) return `From ${format(s, 'h:mm a')}`;
  if (isSameDay(day, last)) return `Until ${format(en, 'h:mm a')}`;
  return 'All day';
}

