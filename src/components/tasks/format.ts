// Pure display helpers for task rows and the detail drawer.
import { differenceInCalendarDays, format, parseISO } from 'date-fns';

function timeOf(d: Date): string {
  return d.getMinutes() === 0 ? format(d, 'h a') : format(d, 'h:mm a');
}

/** End-of-day deadlines read as just the day ("Fri" rather than "Fri 11:59 PM"). */
const isEndOfDay = (d: Date) => d.getHours() === 23 && d.getMinutes() === 59;

/**
 * Short due label: "Today 11:59 PM", "Tomorrow 5 PM", "Fri", "Nov 3", "Yesterday",
 * "2 days ago". `overdue` is true when the deadline has passed.
 */
export function dueLabel(dueIso: string, now: Date): { text: string; overdue: boolean } {
  const due = new Date(dueIso);
  const days = differenceInCalendarDays(due, now);
  const overdue = due.getTime() < now.getTime();
  if (days === 0) return { text: `Today ${timeOf(due)}`, overdue };
  if (days === 1) return { text: `Tomorrow${isEndOfDay(due) ? '' : ` ${timeOf(due)}`}`, overdue };
  if (days === -1) return { text: 'Yesterday', overdue };
  if (days < 0) return { text: `${-days} days ago`, overdue };
  const day = days < 7 ? format(due, 'EEE') : format(due, due.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy');
  return { text: isEndOfDay(due) ? day : `${day} ${timeOf(due)}`, overdue };
}

/** Relative companion to an absolute due date: "Today 5 PM", "Fri", "2 days ago", "in 18 days". */
export function relativeDue(dueIso: string, now: Date): string {
  const days = differenceInCalendarDays(new Date(dueIso), now);
  return days >= 7 ? `in ${days} days` : dueLabel(dueIso, now).text;
}

/** "Plan: Wed" / "Plan: Today" for a `yyyy-MM-dd` do-date. */
export function doDateLabel(doDate: string, now: Date): string {
  const d = parseISO(doDate);
  const days = differenceInCalendarDays(d, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return format(d, 'EEE');
  return format(d, 'MMM d');
}

/** "25m", "1h 5m", "2h"; under a minute → "<1m". */
export function formatDuration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '<1m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "30m", "1h 30m", "2h" for an estimate in minutes. */
export const formatEstimate = (min: number) => formatDuration(min * 60_000);

/** Button label for an assignment's home link, by host. */
export function openLinkLabel(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'Open link';
  }
  if (host.includes('canvas') || host.includes('instructure')) return 'Open in Canvas';
  if (host.includes('prairielearn')) return 'Open in PrairieLearn';
  if (host.includes('piazza')) return 'Open in Piazza';
  return 'Open link';
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
