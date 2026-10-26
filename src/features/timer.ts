// STUB – owned by the time agent (keep these exported signatures; replace the bodies).
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { TaskRef } from '../types';

/** Start timing `ref`; a timer already running for another task is stopped and logged first. */
export function startTimer(ref: TaskRef): void {
  stopTimer();
  useStore.getState().setRunningTimer({ taskRef: ref, start: new Date().toISOString() });
}

/** Stop the running timer (if any) and log its time entry. */
export function stopTimer(): void {
  const { runningTimer, addTimeEntry, setRunningTimer } = useStore.getState();
  if (!runningTimer) return;
  addTimeEntry({ taskRef: runningTimer.taskRef, start: runningTimer.start, end: new Date().toISOString() });
  setRunningTimer(null);
}

/** Start `ref`, or stop it if it is the one running. */
export function toggleTimer(ref: TaskRef): void {
  if (useStore.getState().runningTimer?.taskRef === ref) stopTimer();
  else startTimer(ref);
}

/** Live elapsed ms of the running timer (only if it is timing `ref`, when given); ticks every second. */
export function useRunningElapsed(ref?: TaskRef): number {
  const timer = useStore((s) => s.runningTimer);
  const active = timer && (!ref || timer.taskRef === ref) ? timer : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return active ? Math.max(0, now - Date.parse(active.start)) : 0;
}
