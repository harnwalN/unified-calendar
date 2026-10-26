// Helpers for the datetime-local / date / time inputs used to edit time entries.
import { format } from 'date-fns';

/** `yyyy-MM-ddTHH:mm` (local) for <input type="datetime-local">. */
export const toLocalInput = (ms: number) => format(ms, "yyyy-MM-dd'T'HH:mm");

/** Parse a local `yyyy-MM-dd` + `HH:mm` (or a datetime-local value) to epoch ms; NaN if invalid. */
export function fromLocalInput(date: string, time?: string): number {
  const v = time === undefined ? date : `${date}T${time}`;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

/** Validation message for an entry's start/end, or null when it is fine. */
export function validateSpan(start: number, end: number, now = Date.now()): string | null {
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Enter a valid start and end.';
  if (end <= start) return 'End must be after start.';
  // Small slack so "until now" entries typed this minute still pass.
  if (end > now + 60_000) return 'End can’t be in the future.';
  return null;
}
