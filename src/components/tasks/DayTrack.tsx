// One day as a horizontal timeline: events in lanes, scheduled work, deadlines, tracked time,
// night shading from sunrise/sunset, and a "now" line when the day is today.
import { useMemo, type CSSProperties } from 'react';
import { addHours, format } from 'date-fns';
import { useStore } from '../../store';
import { plannedTaskRef } from '../../store/selectors';
import { sunTimes } from '../../lib/sun';
import type { CalEvent } from '../../types';
import Icon from '../Icon';
import { useSunLocation } from '../scenery/sky';
import { assignLanes, inkFor, pct } from './timeline';
import type { DayData } from './usePlannerData';

const HOUR = 3_600_000;

export function openPlannerEvent(e: CalEvent) {
  const ref = plannedTaskRef(e.id);
  if (ref) useStore.getState().selectTask(ref);
  else useStore.getState().selectEvent(e.id);
}

export default function DayTrack({
  data,
  range,
  now,
  compact = false,
}: {
  data: DayData;
  range: [number, number];
  now: number;
  /** Week rows: thinner lanes, tracked time inside the track, no deadline flags' labels. */
  compact?: boolean;
}) {
  const { day, end } = data;
  const at = (t: number) => pct(t, day, range);
  const { loc } = useSunLocation();
  const sun = useMemo(() => sunTimes(new Date(day + 12 * HOUR), loc.lat, loc.lon), [day, loc]);
  const lanes = assignLanes(data.spans, compact ? 2 : 3);
  const laneCount = Math.max(1, ...lanes.map((l) => l.lane + 1));
  const isToday = now >= day && now < end;
  const past = now >= end ? 100 : isToday ? at(now) : 0;
  const hours: number[] = [];
  for (let h = range[0] + 1; h < range[1]; h++) hours.push(h);

  return (
    <div className={`tb-track${compact ? ' compact' : ''}`} style={{ '--lanes': laneCount } as CSSProperties}>
      {!sun.polar && sun.sunrise && sun.sunset ? (
        <>
          <span className="tb-night" style={{ left: 0, width: `${at(sun.sunrise.getTime())}%` }} />
          <span className="tb-night" style={{ left: `${at(sun.sunset.getTime())}%`, right: 0 }} />
        </>
      ) : (
        sun.polar === 'night' && <span className="tb-night" style={{ left: 0, right: 0 }} />
      )}
      {hours.map((h) => (
        <span key={h} className="tb-grid" style={{ left: `${at(day + h * HOUR)}%` }} />
      ))}
      {past > 0 && <span className="tb-past" style={{ width: `${past}%` }} />}

      {lanes.map(({ span: s, lane }, i) => (
        <button
          key={s.id}
          className={`tb-event${s.planned ? ' planned' : ''}${s.className ? ' class' : ''}${s.end <= now ? ' past' : ''}`}
          style={
            {
              left: `${at(s.start)}%`,
              width: `max(6px, ${at(s.end) - at(s.start)}%)`,
              top: `calc(${lane} * var(--lane-h) + var(--track-pad))`,
              '--ev-color': s.color,
              '--ev-ink': inkFor(s.color),
              '--i': i,
            } as CSSProperties
          }
          onClick={() => openPlannerEvent(s.event)}
          title={`${s.event.title} · ${format(s.start, 'h:mm')}–${format(s.end, 'h:mm a')}${s.planned ? ' (scheduled work)' : s.className ? ` (${s.className} class)` : ''}`}
        >
          {s.className && <Icon name="school" size={compact ? 11 : 13} className="tb-event-icon" />}
          <span>{s.event.title}</span>
        </button>
      ))}

      {data.due.map((task) => (
        <button
          key={task.ref}
          className="tb-due"
          style={{ left: `clamp(10px, ${at(Date.parse(task.due))}%, calc(100% - 10px))` }}
          onClick={() => useStore.getState().selectTask(task.ref)}
          title={`Due ${format(new Date(task.due), 'h:mm a')}: ${task.title}`}
          aria-label={`Due ${format(new Date(task.due), 'h:mm a')}: ${task.title}`}
        >
          <Icon name="flag" size={compact ? 12 : 14} />
        </button>
      ))}

      {compact && data.tracked.length > 0 && <TrackedStrip data={data} at={at} inline />}
      {isToday && <span className="tb-nowline" style={{ left: `${at(now)}%` }} aria-hidden="true" />}
    </div>
  );
}

/** Thin strip of tracked time, colored by class. */
export function TrackedStrip({ data, at, inline = false }: { data: DayData; at: (t: number) => number; inline?: boolean }) {
  return (
    <div className={`tb-tracked${inline ? ' inline' : ''}`} aria-label="Time tracked">
      {data.tracked.map((s) => (
        <span
          key={s.id}
          className={s.id === 'running' ? 'running' : undefined}
          style={{ left: `${at(s.start)}%`, width: `max(3px, ${at(s.end) - at(s.start)}%)`, background: s.color }}
          title={`${s.title}: ${format(s.start, 'h:mm')}–${format(s.end, 'h:mm a')}`}
        />
      ))}
    </div>
  );
}

/** Hour labels under (or above) a track. */
export function HourAxis({ day, range }: { day: number; range: [number, number] }) {
  // Label every hour on short ranges, every 2 or 3 hours on long ones (narrow screens: see CSS).
  const span = range[1] - range[0];
  const step = span > 18 ? 3 : span > 12 ? 2 : 1;
  const hours: number[] = [];
  for (let h = range[0]; h <= range[1]; h++) if (h % step === 0) hours.push(h);
  return (
    <div className="tb-hours" aria-hidden="true">
      {hours.map((h) => (
        <span key={h} className={h % 3 === 0 ? 'major' : undefined} style={{ left: `${pct(day + h * HOUR, day, range)}%` }}>
          {format(addHours(day, h), 'h a').replace(' ', ' ')}
        </span>
      ))}
    </div>
  );
}
