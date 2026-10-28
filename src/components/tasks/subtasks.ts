// Pure helpers for dated subtasks ("study sessions Mon–Thu before Friday's test").
import { addDays, startOfDay } from 'date-fns';
import { newId } from '../../store';
import { dayKey } from '../../store/tasks';
import type { Subtask } from '../../types';

/** "One per day until due" never adds more than this many sessions. */
export const MAX_DAILY_SUBTASKS = 14;

/**
 * New subtasks titled `title`, one for each day from today up to the day before `dueIso`,
 * skipping days that already have a subtask. Empty when the deadline is today or past.
 */
export function perDaySubtasks(existing: Subtask[], title: string, dueIso: string, now: Date): Subtask[] {
  const taken = new Set(existing.map((s) => s.doDate).filter(Boolean));
  const dueDay = dayKey(dueIso);
  const out: Subtask[] = [];
  for (let d = startOfDay(now), i = 0; i < MAX_DAILY_SUBTASKS; d = addDays(d, 1), i++) {
    const key = dayKey(d);
    if (key >= dueDay) break;
    if (!taken.has(key)) out.push({ id: newId(), title, done: false, doDate: key });
  }
  return out;
}
