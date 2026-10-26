// Pure helpers for scheduling work blocks on tasks.
import { addDays, format, parse } from 'date-fns';
import { newId } from '../../store';
import { dayKey } from '../../store/tasks';
import type { WorkBlock } from '../../types';

export const DURATIONS = [30, 60, 90, 120, 180];

/** Next half hour from `now` as "HH:mm" (e.g. 14:10 → "14:30"); late evenings fall back to 09:00. */
export function defaultStartTime(now: Date): string {
  const mins = now.getHours() * 60 + now.getMinutes();
  const next = Math.ceil((mins + 1) / 30) * 30;
  if (next >= 22 * 60) return '09:00';
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

/** `count` consecutive day keys starting at `start`. */
export function dayKeys(start: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => dayKey(addDays(start, i)));
}

/** One block per selected day at the same local time and length, sorted by start. */
export function buildBlocks(days: string[], time: string, durationMin: number): WorkBlock[] {
  return [...days]
    .sort()
    .map((day) => ({
      id: newId(),
      start: parse(`${day} ${time}`, 'yyyy-MM-dd HH:mm', new Date()).toISOString(),
      durationMin,
    }));
}

/** Merge new blocks into existing ones, dropping exact duplicates (same start + length). */
export function mergeBlocks(existing: WorkBlock[] | undefined, added: WorkBlock[]): WorkBlock[] {
  const all = [...(existing ?? [])];
  for (const b of added) {
    if (!all.some((e) => e.start === b.start && e.durationMin === b.durationMin)) all.push(b);
  }
  return all.sort((a, b) => a.start.localeCompare(b.start));
}

/** "Wed, Oct 28 · 2:00 – 3:30 PM". */
export function formatBlock(b: WorkBlock): string {
  const start = new Date(b.start);
  const end = new Date(start.getTime() + b.durationMin * 60_000);
  const sameHalf = format(start, 'a') === format(end, 'a');
  return `${format(start, 'EEE, MMM d')} · ${format(start, sameHalf ? 'h:mm' : 'h:mm a')} – ${format(end, 'h:mm a')}`;
}

export const totalScheduledMin = (blocks: WorkBlock[] | undefined) =>
  (blocks ?? []).reduce((sum, b) => sum + b.durationMin, 0);
