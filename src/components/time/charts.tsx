// Inline HTML/CSS charts for the Time page (no chart library).
import { format } from 'date-fns';
import { dayKey } from '../../store/tasks';
import { formatDuration, sortedDesc, type Span } from '../../features/timeStats';
import type { CSSProperties } from 'react';
import type { TaskRef } from '../../types';
import type { MeetingSpan } from '../../features/classMeetings';
import type { TaskLabel } from '../../features/timer';
import { useChartTip } from './ChartTip';
import type { Group } from './useTimeStats';

const HOUR = 3_600_000;

/** Legend row; always shown for ≥ 2 series so identity never rests on color alone. */
export function Legend({ groups, classTime = false }: { groups: Group[]; classTime?: boolean }) {
  if (groups.length < 2 && !classTime) return null;
  return (
    <ul className="chart-legend" aria-label="Legend">
      {groups.map((g) => (
        <li key={g.key}>
          <span className="chart-swatch" style={{ background: g.color }} aria-hidden="true" />
          {g.name}
        </li>
      ))}
      {classTime && <ClassTimeKey />}
    </ul>
  );
}

/** Legend entry explaining the hatched "in class" fill. */
export function ClassTimeKey() {
  return (
    <li className="chart-legend-class">
      <span className="chart-swatch class-time" style={{ '--c': 'var(--text-2)' } as CSSProperties} aria-hidden="true" />
      In class (hatched)
    </li>
  );
}

/** Horizontal bars: time per group (tracked solid, class meetings hatched), largest first, value at the tip. */
export function GroupBars({ groups, totals, classTotals }: { groups: Group[]; totals: Map<string, number>; classTotals?: Map<string, number> }) {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const sums = new Map(totals);
  for (const [k, ms] of classTotals ?? []) sums.set(k, (sums.get(k) ?? 0) + ms);
  const rows = sortedDesc(sums).filter(([k]) => byKey.has(k));
  const max = rows[0]?.[1] ?? 1;
  return (
    <ul className="group-bars">
      {rows.map(([key, sum]) => {
        const g = byKey.get(key)!;
        const tracked = totals.get(key) ?? 0;
        const inClass = classTotals?.get(key) ?? 0;
        const detail = inClass ? `${formatDuration(tracked)} tracked + ${formatDuration(inClass)} in class` : formatDuration(tracked);
        return (
          <li key={key} title={`${g.name}: ${detail}`}>
            <span className="group-bars-name">
              <span className="chart-swatch" style={{ background: g.color }} aria-hidden="true" />
              <span className="ellipsis">{g.name}</span>
            </span>
            <span className="group-bars-track">
              <span className="group-bars-bar" style={{ width: `${(tracked / max) * 100}%`, background: g.color }} />
              {inClass > 0 && (
                <span
                  className="group-bars-bar class-time"
                  style={{ left: `${(tracked / max) * 100}%`, width: `${(inClass / max) * 100}%`, '--c': g.color } as CSSProperties}
                />
              )}
              <span className="group-bars-value" style={{ left: `calc(${(sum / max) * 100}% + 8px)` }}>
                {formatDuration(sum)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One day's entries placed by clock time. */
export function DayTimeline({
  spans,
  dayStart,
  now,
  label,
  classSpans = [],
  classColor,
}: {
  spans: Span[];
  dayStart: number;
  now: number;
  label: (ref: TaskRef) => TaskLabel;
  /** Class meetings, drawn hatched behind tracked time. */
  classSpans?: MeetingSpan[];
  classColor?: (classId: string) => { name: string; color: string };
}) {
  const { containerRef, bind, tip } = useChartTip();
  const hourOf = (ms: number) => (ms - dayStart) / HOUR;
  // Show 8am–8pm at least, widened to fit every entry.
  const all = [...spans, ...classSpans];
  const first = Math.min(8, ...all.map((s) => Math.floor(hourOf(s.start))));
  const last = Math.max(20, ...all.map((s) => Math.ceil(hourOf(s.end))));
  const from = Math.max(0, first);
  const to = Math.min(24, last);
  const pct = (ms: number) => ((hourOf(ms) - from) / (to - from)) * 100;
  const step = to - from > 14 ? 3 : 2;
  const ticks: number[] = [];
  for (let h = Math.ceil(from / step) * step; h <= to; h += step) ticks.push(h);
  const nowPct = now >= dayStart && now < dayStart + 24 * HOUR ? pct(now) : null;

  return (
    <div className="timeline" ref={containerRef}>
      <div className="timeline-track">
        {ticks.map((h) => (
          <span key={h} className="timeline-grid" style={{ left: `${((h - from) / (to - from)) * 100}%` }} />
        ))}
        {classSpans.map((s) => {
          const c = classColor?.(s.classId) ?? { name: 'Class', color: 'var(--text-3)' };
          const detail = `In class · ${format(s.start, 'h:mm a')} – ${format(s.end, 'h:mm a')} · ${formatDuration(s.end - s.start)}`;
          return (
            <span
              key={`class-${s.classId}-${s.start}`}
              className="timeline-block class-time"
              style={{ left: `${pct(s.start)}%`, width: `max(3px, ${pct(s.end) - pct(s.start)}%)`, '--c': c.color } as CSSProperties}
              tabIndex={0}
              role="img"
              aria-label={`${s.title} (${c.name}), ${detail}`}
              {...bind({ color: c.color, title: `${s.title} · ${c.name}`, detail })}
            />
          );
        })}
        {spans.map((s) => {
          const l = label(s.taskRef);
          const detail = `${format(s.start, 'h:mm a')} – ${format(s.end, 'h:mm a')} · ${formatDuration(s.end - s.start)}`;
          return (
            <span
              key={`${s.entryId ?? 'running'}-${s.start}`}
              className={`timeline-block${s.entryId ? '' : ' live'}`}
              style={{ left: `${pct(s.start)}%`, width: `max(3px, ${pct(s.end) - pct(s.start)}%)`, background: l.color }}
              tabIndex={0}
              role="img"
              aria-label={`${l.title}, ${detail}`}
              {...bind({ color: l.color, title: l.title, detail })}
            />
          );
        })}
        {nowPct !== null && nowPct <= 100 && <span className="timeline-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />}
      </div>
      <div className="timeline-axis" aria-hidden="true">
        {ticks.map((h) => (
          <span key={h} style={{ left: `${((h - from) / (to - from)) * 100}%` }}>
            {format(dayStart + h * HOUR, h % 24 === 0 ? 'ha' : 'h a').replace(' ', ' ')}
          </span>
        ))}
      </div>
      {tip}
    </div>
  );
}

/** Clean y-axis step (in hours) for a max value. */
function niceStep(maxH: number): number {
  for (const s of [0.5, 1, 2, 3, 4, 6, 8]) if (maxH / s <= 4) return s;
  return 12;
}

/** Stacked columns: one per day, segments per group in legend order. */
export function WeekChart({
  days,
  byDayGroup,
  byDay,
  groups,
  today,
  classByDayGroup,
  classByDay,
}: {
  days: Date[];
  byDayGroup: Map<string, Map<string, number>>;
  byDay: Map<string, number>;
  groups: Group[];
  today: string;
  /** Class meeting time, stacked hatched on top of each class's tracked time. */
  classByDayGroup?: Map<string, Map<string, number>>;
  classByDay?: Map<string, number>;
}) {
  const { containerRef, bind, tip } = useChartTip();
  const dayTotal = (key: string) => (byDay.get(key) ?? 0) + (classByDay?.get(key) ?? 0);
  const maxH = Math.max(1, ...days.map((d) => dayTotal(dayKey(d)) / HOUR));
  const step = niceStep(maxH);
  const top = Math.ceil(maxH / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  return (
    <div className="week-chart" ref={containerRef}>
      <div className="week-chart-plot">
        <div className="week-chart-grid" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              <em>{t ? `${t}h` : '0'}</em>
            </span>
          ))}
        </div>
        <div className="week-chart-cols">
          {days.map((d) => {
            const key = dayKey(d);
            const segs = byDayGroup.get(key);
            const classSegs = classByDayGroup?.get(key);
            const total = dayTotal(key);
            const dayName = format(d, 'EEEE, MMM d');
            return (
              <div key={key} className="week-chart-col">
                <div className="week-chart-stack" style={{ height: `${(total / HOUR / top) * 100}%` }}>
                  {total > 0 && <span className="week-chart-cap">{formatDuration(total)}</span>}
                  {groups.flatMap((g) => {
                    const ms = segs?.get(g.key);
                    const cms = classSegs?.get(g.key);
                    const out = [];
                    if (ms) {
                      const detail = `${dayName} · ${formatDuration(ms)}`;
                      out.push(
                        <span
                          key={g.key}
                          className="week-chart-seg"
                          style={{ flexGrow: ms, background: g.color }}
                          tabIndex={0}
                          role="img"
                          aria-label={`${g.name}, ${detail}`}
                          {...bind({ color: g.color, title: g.name, detail })}
                        />,
                      );
                    }
                    if (cms) {
                      const detail = `${dayName} · ${formatDuration(cms)} in class`;
                      out.push(
                        <span
                          key={`${g.key}-class`}
                          className="week-chart-seg class-time"
                          style={{ flexGrow: cms, '--c': g.color } as CSSProperties}
                          tabIndex={0}
                          role="img"
                          aria-label={`${g.name}, ${detail}`}
                          {...bind({ color: g.color, title: `${g.name} · in class`, detail })}
                        />,
                      );
                    }
                    return out;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="week-chart-x" aria-hidden="true">
        {days.map((d) => (
          <span key={d.toISOString()} className={dayKey(d) === today ? 'today' : undefined}>
            <b>{format(d, 'EEEEE')}</b>
            <span className="week-chart-x-long">{format(d, 'EEE')}</span> {format(d, 'd')}
          </span>
        ))}
      </div>
      {tip}
    </div>
  );
}
