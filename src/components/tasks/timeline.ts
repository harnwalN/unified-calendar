// Pure layout for the Today time bar: visible hour range, event lanes and percentages.

const HOUR = 3_600_000;
export const DEFAULT_RANGE: [number, number] = [7, 23];

export interface Span {
  id: string;
  start: number;
  end: number;
}

/**
 * Hours [from, to) to show for a day starting at `day`: the default waking day, widened to fit
 * the spans and (when it falls on that day) the current time `now`.
 */
export function hourRange(spans: Span[], day: number, now?: number): [number, number] {
  let [from, to] = DEFAULT_RANGE;
  const hourOf = (t: number) => (t - day) / HOUR;
  for (const s of spans) {
    from = Math.min(from, Math.floor(Math.max(0, hourOf(s.start))));
    to = Math.max(to, Math.ceil(Math.min(24, hourOf(s.end))));
  }
  if (now !== undefined && now >= day && now < day + 24 * HOUR) {
    const n = hourOf(now);
    from = Math.min(from, Math.floor(n));
    to = Math.max(to, Math.ceil(n + 0.01));
  }
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

/** Distinct event colors (Google Calendar's event palette plus a few), ordered so neighbours differ. */
export const EVENT_COLORS = [
  '#039be5', // peacock
  '#e67c73', // flamingo
  '#33b679', // sage
  '#8e24aa', // grape
  '#f4511e', // tangerine
  '#3f51b5', // blueberry
  '#f6bf26', // banana
  '#00897b', // teal
  '#d81b60', // raspberry
  '#7986cb', // lavender
  '#c0ca33', // citron
  '#795548', // cocoa
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A color per event: the same title always gets the same color (so a weekly lecture is
 * recognisable), but an event never shares a color with the one right before it.
 */
export function eventColors(spans: { id: string; title: string; start: number; end: number }[]): Map<string, string> {
  const out = new Map<string, string>();
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  let prev: { color: number; end: number } | null = null;
  for (const s of sorted) {
    let c = hash(s.title.trim().toLowerCase()) % EVENT_COLORS.length;
    // Clash with the previous event when they overlap or sit within 30 minutes of each other.
    if (prev && prev.color === c && s.start - prev.end < 30 * 60_000) c = (c + 5) % EVENT_COLORS.length;
    out.set(s.id, EVENT_COLORS[c]);
    prev = { color: c, end: s.end };
  }
  return out;
}

/** Readable text color (dark or white) on top of `hex`. */
export function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#1f1f1f' : '#ffffff';
}
