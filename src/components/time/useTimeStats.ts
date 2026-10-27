// Data plumbing for the Time page: spans (including the live timer) aggregated over a range,
// plus time spent in class meetings (lectures, labs…) when `includeClasses` is on.
import { useMemo } from 'react';
import { useStore } from '../../store';
import { useAllEvents } from '../../store/selectors';
import { useClasses } from '../../store/tasks';
import { useRunningElapsed, useTaskLabeler, type TaskLabel } from '../../features/timer';
import { aggregate, collectSpans, splitAtMidnight, type RangeStats } from '../../features/timeStats';
import { meetingSpans, useClassMatcher, type MeetingSpan } from '../../features/classMeetings';
import { dayKey } from '../../store/tasks';
import type { TaskRef } from '../../types';

export interface Group {
  key: string;
  name: string;
  color: string;
}

export interface ClassTime {
  totalMs: number;
  byGroup: Map<string, number>;
  byDay: Map<string, number>;
  byDayGroup: Map<string, Map<string, number>>;
  spans: MeetingSpan[];
}

export interface TimeStats extends RangeStats {
  now: number;
  label: (ref: TaskRef) => TaskLabel;
  /** Groups that have time in the range, in a stable order (class order, then Personal, Quick, …). */
  groups: Group[];
  running: boolean;
  /** Time in class meetings (empty when not included). */
  classTime: ClassTime;
}

const add = <K>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** Aggregate all tracked time in [from, to), live while a timer runs. */
export function useTimeStats(from: number, to: number, includeClasses = true): TimeStats {
  const entries = useStore((s) => s.timeEntries);
  const timer = useStore((s) => s.runningTimer);
  const tick = useRunningElapsed(); // re-renders every second only while running
  const label = useTaskLabeler();
  const classes = useClasses();
  const events = useAllEvents();
  const match = useClassMatcher();

  return useMemo(() => {
    const now = Date.now();
    const stats = aggregate(collectSpans(entries, timer, now), from, to, (ref) => label(ref).groupKey);

    const classTime: ClassTime = { totalMs: 0, byGroup: new Map(), byDay: new Map(), byDayGroup: new Map(), spans: [] };
    if (includeClasses) {
      for (const span of meetingSpans(events, match, from, to, now)) {
        for (const [s, e] of splitAtMidnight(span.start, span.end)) {
          const day = dayKey(s);
          classTime.totalMs += e - s;
          add(classTime.byGroup, span.classId, e - s);
          add(classTime.byDay, day, e - s);
          if (!classTime.byDayGroup.has(day)) classTime.byDayGroup.set(day, new Map());
          add(classTime.byDayGroup.get(day)!, span.classId, e - s);
          classTime.spans.push({ ...span, start: s, end: e });
        }
      }
    }

    // Color follows the entity: fixed group order independent of the totals.
    const rank = new Map(classes.map((c, i) => [c.id, i]));
    const extra = ['personal', 'quick', 'deleted'];
    const order = (k: string) => rank.get(k) ?? (k.startsWith('course:') ? 900 : 1000 + extra.indexOf(k));
    const seen = new Map<string, Group>();
    for (const span of stats.spans) {
      const l = label(span.taskRef);
      if (!seen.has(l.groupKey)) seen.set(l.groupKey, { key: l.groupKey, name: l.groupName, color: l.color });
    }
    for (const id of classTime.byGroup.keys()) {
      const c = classes.find((x) => x.id === id);
      if (c && !seen.has(id)) seen.set(id, { key: id, name: c.name, color: c.color });
    }
    const groups = [...seen.values()].sort((a, b) => order(a.key) - order(b.key) || a.name.localeCompare(b.name));
    return { ...stats, now, label, groups, running: !!timer, classTime };
    // `tick` keeps `now` fresh while a timer runs.
  }, [entries, timer, tick, label, classes, events, match, includeClasses, from, to]);
}
