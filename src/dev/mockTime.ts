// Dev-only fixture: realistic time entries over the past week for ?mock (call after mock events/tasks load).
import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';
import { useStore } from '../store';
import { logTime } from '../features/timer';
import type { TaskRef } from '../types';

/** Small deterministic PRNG so the fixture looks the same on every reload. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

export function loadMockTime(): void {
  const s = useStore.getState();
  const assignments = Object.values(s.eventsBySource)
    .flat()
    .filter((e) => e.kind === 'assignment');
  const personal = Object.values(s.tasks).filter((t) => !t.deleted);
  const refs: TaskRef[] = [
    ...assignments.map((e) => `a:${e.uid}` as const),
    ...personal.map((t) => `t:${t.id}` as const),
  ];
  if (!refs.length) return;
  // Entries persist in the store; only seed once.
  const known = new Set<string>(refs);
  if (Object.values(s.timeEntries).some((e) => known.has(e.taskRef))) return;

  const rand = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const now = Date.now();
  const today = startOfDay(now);

  for (let back = 6; back >= 0; back--) {
    const day = addDays(today, -back);
    let t = setMinutes(setHours(day, 9 + Math.floor(rand() * 3)), Math.floor(rand() * 4) * 15).getTime();
    const sessions = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < sessions; i++) {
      const dur = (20 + Math.floor(rand() * 90)) * 60_000;
      const end = Math.min(t + dur, now - 10 * 60_000);
      if (end <= t) break;
      logTime(pick(refs), t, end);
      t = end + (15 + Math.floor(rand() * 120)) * 60_000;
    }
  }
  // One late-night session that crosses midnight.
  const lateStart = setMinutes(setHours(addDays(today, -2), 23), 20).getTime();
  logTime(refs[0], lateStart, lateStart + 70 * 60_000);

  // A few estimates so the Estimates tab has something to compare.
  const estimates = [240, 180, 120, 300, 45];
  refs.slice(0, estimates.length).forEach((ref, i) => {
    const task = ref.startsWith('a:') ? s.meta[ref.slice(2)] : s.tasks[ref.slice(2)];
    if (!task?.estimateMin) useStore.getState().updateTaskFields(ref, { estimateMin: estimates[i] });
  });
}
