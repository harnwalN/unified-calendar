// Today at a glance: one horizontal timeline from morning to night with events, scheduled work,
// deadlines, tracked time, night shading and a live "now" line.
import { useMemo, type CSSProperties } from 'react';
import { addHours, format, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import { useTasks } from '../../store/tasks';
import { PLANNED_CALENDAR_ID, plannedTaskRef, useVisibleEvents } from '../../store/selectors';
import { useTaskLabeler } from '../../features/timer';
import { sunTimes } from '../../lib/sun';
import type { CalEvent, TaskView } from '../../types';
import Icon from '../Icon';
import { useNow } from '../hooks';
import { useSunLocation } from '../scenery/sky';
import { formatDuration } from './format';
import { assignLanes, hourRange, pct, type Span } from './timeline';
import './TodayBar.css';

const DAY = 86_400_000;

interface EventSpan extends Span {
  event: CalEvent;
}

export default function TodayBar() {
  const now = useNow(30_000);
  const day = startOfDay(now).getTime();
  const events = useVisibleEvents();
  const tasks = useTasks();
  const calendars = useStore((s) => s.calendars);
  const entries = useStore((s) => s.timeEntries);
  const timer = useStore((s) => s.runningTimer);
  const label = useTaskLabeler();
  const { loc } = useSunLocation();

  const spans = useMemo<EventSpan[]>(
    () =>
      events
        .filter((e) => !e.allDay && e.kind !== 'assignment')
        .map((e) => ({ id: e.id, start: Math.max(Date.parse(e.start), day), end: Math.min(Date.parse(e.end), day + DAY), event: e }))
        .filter((s) => s.end > day && s.start < day + DAY),
    [events, day],
  );
  const dueToday = useMemo(
    () =>
      tasks.filter(
        (t): t is TaskView & { due: string } =>
          t.status !== 'done' && !!t.due && Date.parse(t.due) >= day && Date.parse(t.due) < day + DAY,
      ),
    [tasks, day],
  );
  const tracked = useMemo(() => {
    const out = Object.values(entries)
      .filter((e) => !e.deleted && Date.parse(e.end) > day && Date.parse(e.start) < day + DAY)
      .map((e) => ({ id: e.id, ref: e.taskRef, start: Math.max(Date.parse(e.start), day), end: Date.parse(e.end) }));
    if (timer) out.push({ id: 'running', ref: timer.taskRef, start: Math.max(Date.parse(timer.start), day), end: now.getTime() });
    return out;
  }, [entries, timer, day, now]);

  const range = hourRange(spans, now);
  const at = (t: number) => pct(t, day, range);
  const lanes = assignLanes(spans);
  const laneCount = Math.max(1, ...lanes.map((l) => l.lane + 1));
  const sun = useMemo(() => sunTimes(now, loc.lat, loc.lon), [day, loc]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours: number[] = [];
  for (let h = range[0]; h <= range[1]; h++) hours.push(h);

  const t = now.getTime();
  const current = spans.find((s) => s.start <= t && s.end > t);
  const next = spans.filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0];
  const endOfRange = day + range[1] * 3_600_000;
  const left = Math.max(0, endOfRange - t);

  const open = (e: CalEvent) => {
    const ref = e.calendarId === PLANNED_CALENDAR_ID ? plannedTaskRef(e.id) : null;
    if (ref) useStore.getState().selectTask(ref);
    else useStore.getState().selectEvent(e.id);
  };
  const colorOf = (e: CalEvent) => calendars[e.calendarId]?.color ?? (e.calendarId === PLANNED_CALENDAR_ID ? '#0b8043' : '#1a73e8');

  return (
    <section className="today-bar" aria-label="Today's timeline">
      <div className="tb-head">
        <span className="tb-now-label">
          <Icon name="schedule" size={18} />
          {format(now, 'h:mm a')}
        </span>
        <span className="tb-status">
          {current ? (
            <>
              Now: <strong>{current.event.title}</strong> until {format(current.end, 'h:mm a')}
            </>
          ) : next ? (
            <>
              Next: <strong>{next.event.title}</strong> {inLabel(next.start - t)}
            </>
          ) : (
            'Nothing else on the calendar today'
          )}
        </span>
        <span className="tb-left">{left > 0 ? `${formatDuration(left)} left until ${format(endOfRange, 'h a')}` : 'Day’s done'}</span>
      </div>

      <div className="tb-track" style={{ '--lanes': laneCount } as CSSProperties}>
        {!sun.polar && sun.sunrise && sun.sunset ? (
          <>
            <span className="tb-night" style={{ left: 0, width: `${at(sun.sunrise.getTime())}%` }} />
            <span className="tb-night" style={{ left: `${at(sun.sunset.getTime())}%`, right: 0 }} />
          </>
        ) : (
          sun.polar === 'night' && <span className="tb-night" style={{ left: 0, right: 0 }} />
        )}
        {hours.slice(1, -1).map((h) => (
          <span key={h} className="tb-grid" style={{ left: `${at(day + h * 3_600_000)}%` }} />
        ))}
        <span className="tb-past" style={{ width: `${at(t)}%` }} />

        {lanes.map(({ span: s, lane }) => {
          const planned = s.event.calendarId === PLANNED_CALENDAR_ID;
          return (
            <button
              key={s.id}
              className={`tb-event${planned ? ' planned' : ''}${s.end <= t ? ' past' : ''}`}
              style={
                {
                  left: `${at(s.start)}%`,
                  width: `max(6px, ${at(s.end) - at(s.start)}%)`,
                  top: `calc(${lane} * var(--lane-h) + 6px)`,
                  '--ev-color': colorOf(s.event),
                } as CSSProperties
              }
              onClick={() => open(s.event)}
              title={`${s.event.title} · ${format(s.start, 'h:mm')}–${format(s.end, 'h:mm a')}${planned ? ' (scheduled work)' : ''}`}
            >
              <span>{s.event.title}</span>
            </button>
          );
        })}

        {dueToday.map((task) => (
          <button
            key={task.ref}
            className="tb-due"
            style={{ left: `clamp(10px, ${at(Date.parse(task.due))}%, calc(100% - 10px))` }}
            onClick={() => useStore.getState().selectTask(task.ref)}
            title={`Due ${format(new Date(task.due), 'h:mm a')}: ${task.title}`}
            aria-label={`Due ${format(new Date(task.due), 'h:mm a')}: ${task.title}`}
          >
            <Icon name="flag" size={14} />
          </button>
        ))}

        <span className="tb-nowline" style={{ left: `${at(t)}%` }} aria-hidden="true" />
      </div>

      {tracked.length > 0 && (
        <div className="tb-tracked" aria-label="Time tracked today">
          {tracked.map((s) => {
            const l = label(s.ref);
            return (
              <span
                key={s.id}
                className={s.id === 'running' ? 'running' : undefined}
                style={{ left: `${at(s.start)}%`, width: `max(3px, ${at(s.end) - at(s.start)}%)`, background: l.color }}
                title={`${l.title}: ${format(s.start, 'h:mm')}–${format(s.end, 'h:mm a')}`}
              />
            );
          })}
        </div>
      )}

      <div className="tb-hours" aria-hidden="true">
        {hours.map((h) => (
          <span key={h} className={h % 3 === 0 ? 'major' : undefined} style={{ left: `${at(day + h * 3_600_000)}%` }}>
            {format(addHours(day, h), 'h a').replace(' ', ' ')}
          </span>
        ))}
      </div>
    </section>
  );
}

function inLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'starting now';
  if (min < 60) return `in ${min} min`;
  return `in ${formatDuration(ms)}`;
}
