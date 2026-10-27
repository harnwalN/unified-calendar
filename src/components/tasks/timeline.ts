// Pure layout for the Today time bar: visible hour range, event lanes and percentages.
import { startOfDay } from 'date-fns';

const HOUR = 3_600_000;
export const DEFAULT_RANGE: [number, number] = [7, 23];

export interface Span {
  id: string;
  start: number;
  end: number;
}

/** Hours [from, to) to show: the default waking day, widened to fit today's spans and `now`. */
export function hourRange(spans: Span[], now: Date): [number, number] {
  const day = startOfDay(now).getTime();
  let [from, to] = DEFAULT_RANGE;
  const hourOf = (t: number) => (t - day) / HOUR;
  for (const s of spans) {
    from = Math.min(from, Math.floor(Math.max(0, hourOf(s.start))));
    to = Math.max(to, Math.ceil(Math.min(24, hourOf(s.end))));
  }
  const n = hourOf(now.getTime());
  from = Math.min(from, Math.floor(n));
  to = Math.max(to, Math.ceil(n + 0.01));
  return [Math.max(0, from), Math.min(24, to)];
}

/** Greedy lane packing so overlapping spans stack instead of covering each other. */
export function assignLanes<T extends Span>(spans: T[], maxLanes = 3): { span: T; lane: number }[] {
  const ends: number[] = [];
  return [...spans]
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((span) => {
      let lane = ends.findIndex((e) => e <= span.start);
      if (lane === -1) lane = ends.length < maxLanes ? ends.length : ends.indexOf(Math.min(...ends));
      ends[lane] = Math.max(ends[lane] ?? 0, span.end);
      return { span, lane };
    });
}

/** Position of time `t` as a percentage of the visible range (clamped to 0–100). */
export function pct(t: number, day: number, [from, to]: [number, number]): number {
  const v = ((t - day) / HOUR - from) / (to - from);
  return Math.min(100, Math.max(0, v * 100));
}
