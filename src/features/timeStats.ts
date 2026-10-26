// Pure time-tracking math: midnight splitting, range clamping and aggregation for the Time page.
import { addDays, startOfDay } from 'date-fns';
import { dayKey } from '../store/tasks';
import type { RunningTimer, TaskRef, TimeEntry } from '../types';

/** A tracked interval in epoch ms (a finished entry or the running timer). */
export interface Span {
  taskRef: TaskRef;
  start: number;
  end: number;
  /** Set for finished entries; absent for the running timer. */
  entryId?: string;
}

/** Split [start, end) at every local midnight it crosses. DST-safe (uses calendar days). */
export function splitAtMidnight(start: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  let s = start;
  while (s < end) {
    const next = startOfDay(addDays(new Date(s), 1)).getTime();
    const e = Math.min(end, next);
    out.push([s, e]);
    s = e;
  }
  return out;
}

/** Live entries (plus the running timer up to `now`, when given) as spans. Invalid entries are skipped. */
export function collectSpans(
  entries: Record<string, TimeEntry>,
  running?: RunningTimer | null,
  now = Date.now(),
): Span[] {
  const spans: Span[] = [];
  for (const e of Object.values(entries)) {
    if (e.deleted) continue;
    const start = Date.parse(e.start);
    const end = Date.parse(e.end);
    if (end > start) spans.push({ taskRef: e.taskRef, start, end, entryId: e.id });
  }
  if (running) {
    const start = Date.parse(running.start);
    if (now > start) spans.push({ taskRef: running.taskRef, start, end: now });
  }
  return spans;
}

/** Spans cut to [from, to); spans outside are dropped. */
export function clampSpans(spans: Span[], from: number, to: number): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    const start = Math.max(s.start, from);
    const end = Math.min(s.end, to);
    if (end > start) out.push({ ...s, start, end });
  }
  return out;
}

const add = <K>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);

export interface RangeStats {
  totalMs: number;
  /** dayKey → total ms. */
  byDay: Map<string, number>;
  /** dayKey → group → ms. */
  byDayGroup: Map<string, Map<string, number>>;
  /** group → ms. */
  byGroup: Map<string, number>;
  /** taskRef → ms. */
  byTask: Map<string, number>;
  /** Clamped spans inside the range, split per day, sorted by start. */
  spans: Span[];
}

/**
 * Aggregate spans inside [from, to) by local day, by group (e.g. class) and by task.
 * `groupOf` maps a task to its group key.
 */
export function aggregate(spans: Span[], from: number, to: number, groupOf: (ref: TaskRef) => string): RangeStats {
  const stats: RangeStats = {
    totalMs: 0,
    byDay: new Map(),
    byDayGroup: new Map(),
    byGroup: new Map(),
    byTask: new Map(),
    spans: [],
  };
  for (const span of clampSpans(spans, from, to)) {
    const group = groupOf(span.taskRef);
    for (const [s, e] of splitAtMidnight(span.start, span.end)) {
      const ms = e - s;
      const day = dayKey(s);
      stats.totalMs += ms;
      add(stats.byDay, day, ms);
      if (!stats.byDayGroup.has(day)) stats.byDayGroup.set(day, new Map());
      add(stats.byDayGroup.get(day)!, group, ms);
      add(stats.byGroup, group, ms);
      add(stats.byTask, span.taskRef, ms);
      stats.spans.push({ ...span, start: s, end: e });
    }
  }
  stats.spans.sort((a, b) => a.start - b.start);
  return stats;
}

/** Map entries sorted by value, largest first. */
export function sortedDesc<K>(m: Map<K, number>): [K, number][] {
  return [...m].sort((a, b) => b[1] - a[1]);
}

export interface EstimateRow {
  ref: TaskRef;
  estimateMs: number;
  actualMs: number;
  /** actual / estimate (1 = exactly on estimate). */
  ratio: number;
}

/** Estimate vs all-time actual for tasks that have an estimate, most over first. */
export function estimateRows(
  tasks: { ref: TaskRef; estimateMin?: number }[],
  totals: Map<string, number>,
): EstimateRow[] {
  return tasks
    .filter((t) => t.estimateMin && t.estimateMin > 0)
    .map((t) => {
      const estimateMs = t.estimateMin! * 60_000;
      const actualMs = totals.get(t.ref) ?? 0;
      return { ref: t.ref, estimateMs, actualMs, ratio: actualMs / estimateMs };
    })
    .sort((a, b) => b.ratio - a.ratio || b.actualMs - a.actualMs);
}

/** "1h 25m", "25m", "40s" (seconds only under a minute). */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Stopwatch display: "0:04:09", "12:00:01". */
export function formatClock(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Parse a typed duration: "90" (minutes), "1:30", "1h 30m", "1.5h", "45m". Returns ms or null.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let min: number | null = null;
  const clock = s.match(/^(\d+):([0-5]\d)$/);
  if (clock) min = Number(clock[1]) * 60 + Number(clock[2]);
  else if (/^\d+(\.\d+)?$/.test(s)) min = Number(s);
  else {
    const m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?|s)?)?)?$/);
    if (m && (m[1] || m[2])) min = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  }
  return min && min > 0 ? Math.round(min * 60_000) : null;
}
