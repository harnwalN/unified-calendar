// Inline HTML/CSS charts for the Time page (no chart library).
import { format } from 'date-fns';
import { dayKey } from '../../store/tasks';
import { formatDuration, sortedDesc, type Span } from '../../features/timeStats';
import type { TaskRef } from '../../types';
import type { TaskLabel } from '../../features/timer';
import { useChartTip } from './ChartTip';
import type { Group } from './useTimeStats';

const HOUR = 3_600_000;

/** Legend row; always shown for ≥ 2 series so identity never rests on color alone. */
export function Legend({ groups }: { groups: Group[] }) {
  if (groups.length < 2) return null;
  return (
    <ul className="chart-legend" aria-label="Legend">
      {groups.map((g) => (
        <li key={g.key}>
          <span className="chart-swatch" style={{ background: g.color }} aria-hidden="true" />
          {g.name}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bars: time per group, largest first, value at the tip. */
export function GroupBars({ groups, totals }: { groups: Group[]; totals: Map<string, number> }) {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const rows = sortedDesc(totals).filter(([k]) => byKey.has(k));
  const max = rows[0]?.[1] ?? 1;
  return (
    <ul className="group-bars">
      {rows.map(([key, ms]) => {
        const g = byKey.get(key)!;
        return (
          <li key={key}>
            <span className="group-bars-name">
              <span className="chart-swatch" style={{ background: g.color }} aria-hidden="true" />
              <span className="ellipsis">{g.name}</span>
            </span>
            <span className="group-bars-track">
              <span className="group-bars-bar" style={{ width: `${(ms / max) * 100}%`, background: g.color }} />
              <span className="group-bars-value" style={{ left: `calc(${(ms / max) * 100}% + 8px)` }}>
                {formatDuration(ms)}
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
}: {
  spans: Span[];
  dayStart: number;
  now: number;
  label: (ref: TaskRef) => TaskLabel;
}) {
  const { containerRef, bind, tip } = useChartTip();
  const hourOf = (ms: number) => (ms - dayStart) / HOUR;
  // Show 8am–8pm at least, widened to fit every entry.
  const first = Math.min(8, ...spans.map((s) => Math.floor(hourOf(s.start))));
  const last = Math.max(20, ...spans.map((s) => Math.ceil(hourOf(s.end))));
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
}: {
  days: Date[];
  byDayGroup: Map<string, Map<string, number>>;
  byDay: Map<string, number>;
  groups: Group[];
  today: string;
}) {
  const { containerRef, bind, tip } = useChartTip();
  const maxH = Math.max(1, ...[...byDay.values()].map((ms) => ms / HOUR));
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
            const total = byDay.get(key) ?? 0;
            const dayName = format(d, 'EEEE, MMM d');
            return (
              <div key={key} className="week-chart-col">
                <div className="week-chart-stack" style={{ height: `${(total / HOUR / top) * 100}%` }}>
                  {total > 0 && <span className="week-chart-cap">{formatDuration(total)}</span>}
                  {groups.map((g) => {
                    const ms = segs?.get(g.key);
                    if (!ms) return null;
                    const detail = `${dayName} · ${formatDuration(ms)}`;
                    return (
                      <span
                        key={g.key}
                        className="week-chart-seg"
                        style={{ flexGrow: ms, background: g.color }}
                        tabIndex={0}
                        role="img"
                        aria-label={`${g.name}, ${detail}`}
                        {...bind({ color: g.color, title: g.name, detail })}
                      />
                    );
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
