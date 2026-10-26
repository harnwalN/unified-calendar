import { differenceInCalendarDays, format, isSameDay } from 'date-fns';
import type { CalEvent } from '../types';

export interface DueSoonGroups {
  /** Not done, due in the past (within `pastDays`), most recent first. */
  overdue: CalEvent[];
  /** Not done, due within the next `aheadDays`, soonest first. */
  upcoming: CalEvent[];
  /** Checked off and due within the same window, soonest first. */
  completed: CalEvent[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Splits assignments around `now` into the Due Soon checklist groups. */
export function getDueSoon(
  events: CalEvent[],
  done: Record<string, number>,
  now: Date,
  { pastDays = 7, aheadDays = 14 }: { pastDays?: number; aheadDays?: number } = {},
): DueSoonGroups {
  const nowMs = now.getTime();
  const from = nowMs - pastDays * DAY_MS;
  const to = nowMs + aheadDays * DAY_MS;
  const groups: DueSoonGroups = { overdue: [], upcoming: [], completed: [] };
  const seen = new Set<string>();

  for (const e of events) {
    if (e.kind !== 'assignment' || seen.has(e.id)) continue;
    const due = Date.parse(e.start);
    if (Number.isNaN(due) || due < from || due > to) continue;
    seen.add(e.id);
    if (done[e.uid]) groups.completed.push(e);
    else if (due < nowMs) groups.overdue.push(e);
    else groups.upcoming.push(e);
  }

  const asc = (a: CalEvent, b: CalEvent) => a.start.localeCompare(b.start);
  groups.upcoming.sort(asc);
  groups.completed.sort(asc);
  groups.overdue.sort((a, b) => asc(b, a));
  return groups;
}

/**
 * Short human due label: "in 45 min", "in 3 h", "Today 11:59 PM", "Tomorrow 11:59 PM",
 * "Fri 11:59 PM", "Nov 12"; overdue: "5 min ago", "3 h ago", "Yesterday", "2 days ago".
 */
export function formatDue(dueIso: string, now: Date): string {
  const due = new Date(dueIso);
  const diffMin = Math.round((due.getTime() - now.getTime()) / 60000);
  const time = format(due, 'h:mm a');

  if (diffMin < 0) {
    const ago = -diffMin;
    if (ago < 60) return `${ago} min ago`;
    if (ago < 24 * 60) return `${Math.floor(ago / 60)} h ago`;
    const days = differenceInCalendarDays(now, due);
    return days <= 1 ? 'Yesterday' : `${days} days ago`;
  }

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `in ${diffMin} min`;
  if (diffMin < 6 * 60) return `in ${Math.floor(diffMin / 60)} h`;
  if (isSameDay(due, now)) return `Today ${time}`;
  const days = differenceInCalendarDays(due, now);
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${format(due, 'EEE')} ${time}`;
  return format(due, 'MMM d');
}
