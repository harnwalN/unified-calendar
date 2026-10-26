// Data plumbing for the Time page: spans (including the live timer) aggregated over a range.
import { useMemo } from 'react';
import { useStore } from '../../store';
import { useClasses } from '../../store/tasks';
import { useRunningElapsed, useTaskLabeler, type TaskLabel } from '../../features/timer';
import { aggregate, collectSpans, type RangeStats } from '../../features/timeStats';
import type { TaskRef } from '../../types';

export interface Group {
  key: string;
  name: string;
  color: string;
}

export interface TimeStats extends RangeStats {
  now: number;
  label: (ref: TaskRef) => TaskLabel;
  /** Groups that have time in the range, in a stable order (class order, then Personal, Quick, …). */
  groups: Group[];
  running: boolean;
}

/** Aggregate all tracked time in [from, to), live while a timer runs. */
export function useTimeStats(from: number, to: number): TimeStats {
  const entries = useStore((s) => s.timeEntries);
  const timer = useStore((s) => s.runningTimer);
  const tick = useRunningElapsed(); // re-renders every second only while running
  const label = useTaskLabeler();
  const classes = useClasses();

  return useMemo(() => {
    const now = Date.now();
    const stats = aggregate(collectSpans(entries, timer, now), from, to, (ref) => label(ref).groupKey);
    // Color follows the entity: fixed group order independent of the totals.
    const rank = new Map(classes.map((c, i) => [c.id, i]));
    const extra = ['personal', 'quick', 'deleted'];
    const order = (k: string) => rank.get(k) ?? (k.startsWith('course:') ? 900 : 1000 + extra.indexOf(k));
    const seen = new Map<string, Group>();
    for (const span of stats.spans) {
      const l = label(span.taskRef);
      if (!seen.has(l.groupKey)) seen.set(l.groupKey, { key: l.groupKey, name: l.groupName, color: l.color });
    }
    const groups = [...seen.values()].sort((a, b) => order(a.key) - order(b.key) || a.name.localeCompare(b.name));
    return { ...stats, now, label, groups, running: !!timer };
    // `tick` keeps `now` fresh while a timer runs.
  }, [entries, timer, tick, label, classes, from, to]);
}
