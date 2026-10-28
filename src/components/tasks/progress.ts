import type { CSSProperties } from 'react';
import type { TaskView } from '../../types';

/**
 * How far along a task is, 0..1. Done → 1; otherwise subtasks done / total; otherwise tracked
 * time against the estimate (capped below 1 so only "done" reads as finished); otherwise 0.
 * `liveMs` is the running timer's elapsed time, not yet in `timeTotalMs`.
 */
export function taskProgress(task: TaskView, liveMs = 0): number {
  if (task.status === 'done') return 1;
  if (task.subtasks.length > 0) return task.subtasks.filter((s) => s.done).length / task.subtasks.length;
  if (task.estimateMin !== undefined && task.estimateMin > 0) {
    return Math.min(0.99, Math.max(0, (task.timeTotalMs + liveMs) / (task.estimateMin * 60_000)));
  }
  return 0;
}

/**
 * Style vars for the row's progress background (see TaskRow.css): `--progress` is the green
 * "done" share from the left, `--prio-tint` colors the rest. Live time is floored to whole
 * minutes so a running timer moves the bar about once a minute, not every second.
 */
export function progressVars(task: TaskView, liveMs = 0): CSSProperties {
  const p = taskProgress(task, Math.floor(liveMs / 60_000) * 60_000);
  return {
    '--progress': `${Math.round(p * 1000) / 10}%`,
    ...(task.priority !== 'none' && { '--prio-tint': `var(--prio-${task.priority}-tint)` }),
  } as CSSProperties;
}
