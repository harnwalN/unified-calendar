import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { useStore } from '../../store';
import { useCalendarColor, useVisibleEvents } from '../../store/selectors';
import {
  barIndexes,
  daySegment,
  isAllDayRow,
  isPointEvent,
  layoutBars,
  layoutOverlaps,
  shortTime,
  type OverlapSlot,
} from '../../lib/time';
import type { CalEvent } from '../../types';
import Icon from '../Icon';
import { useNow } from '../hooks';
import './TimeGrid.css';

/** Short events still get this much vertical room (≈20px at the default hour height). */
const MIN_LAYOUT_MIN = 25;
/** Below this many minutes the block shows title and time on one line. */
const TWO_LINE_MIN = 45;
/** From this many minutes long titles may wrap onto a second line. */
const TALL_MIN = 90;
const MAX_ALLDAY_LANES = 2;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface Placed {
  event: CalEvent;
  startMin: number;
  endMin: number;
  slot: OverlapSlot;
}

function placeDay(events: CalEvent[], day: Date): Placed[] {
  const segs = events.flatMap((event) => {
    const seg = daySegment(event, day);
    return seg ? [{ event, ...seg }] : [];
  });
  const slots = layoutOverlaps(
    segs.map((s) => ({
      id: s.event.id,
      start: s.startMin,
      end: Math.max(s.endMin, s.startMin + MIN_LAYOUT_MIN),
    })),
  );
  return segs.map((s) => ({ ...s, slot: slots.get(s.event.id)! }));
}

export default function TimeGrid({ days }: { days: Date[] }) {
  const events = useVisibleEvents();
  const setCursor = useStore((s) => s.setCursor);
  const setView = useStore((s) => s.setView);
  const now = useNow(60_000);

  const { allDay, timed } = useMemo(() => {
    const allDay: CalEvent[] = [];
    const timed: CalEvent[] = [];
    for (const e of events) (isAllDayRow(e) ? allDay : timed).push(e);
    return { allDay, timed };
  }, [events]);

  const columns = useMemo(() => days.map((d) => placeDay(timed, d)), [days, timed]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const showsToday = days.some((d) => isToday(d));
  // Initial scroll only: an hour before now when today is visible, otherwise 8am.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hourPx = parseFloat(getComputedStyle(el).getPropertyValue('--hour-h')) || 48;
    const n = new Date();
    const hour = showsToday ? Math.max(0, n.getHours() + n.getMinutes() / 60 - 1) : 8;
    el.scrollTop = hour * hourPx;
  }, []);

  const gridStyle = { '--days': days.length } as CSSProperties;

  return (
    <div className={`tg${days.length === 1 ? ' tg-single' : ''}`} style={gridStyle}>
      <div className="tg-head">
        <div className="tg-gutter tg-tz">{format(now, 'O')}</div>
        {days.map((d) => (
          <button
            key={d.getTime()}
            className={`tg-dayhead${isToday(d) ? ' today' : ''}`}
            onClick={() => {
              setCursor(d);
              setView('day');
            }}
            aria-label={format(d, 'EEEE, MMMM d')}
          >
            <span className="tg-wd">{format(d, 'EEE')}</span>
            <span className="tg-num">{format(d, 'd')}</span>
          </button>
        ))}
      </div>

      <AllDayRow days={days} events={allDay} />

      <div className="tg-body" ref={scrollRef}>
        <div className="tg-grid">
          <div className="tg-gutter tg-hours" aria-hidden="true">
            {HOURS.slice(1).map((h) => (
              <span key={h} style={{ top: `calc(var(--hour-h) * ${h})` }}>
                {format(new Date(2026, 0, 1, h), 'h a')}
              </span>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d.getTime()} className="tg-col" aria-label={format(d, 'EEEE, MMMM d')} role="group">
              <div className="tg-col-events">
                {columns[i].map((p) => (
                  <TimedBlock key={p.event.id} placed={p} />
                ))}
              </div>
              {isSameDay(d, now) && (
                <div
                  className="tg-now"
                  style={{ top: `calc(var(--hour-h) * ${(now.getHours() * 60 + now.getMinutes()) / 60})` }}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimedBlock({ placed }: { placed: Placed }) {
  const { event, startMin, endMin, slot } = placed;
  const color = useCalendarColor(event.calendarId);
  const done = useStore((s) => !!s.done[event.uid]);
  const selectEvent = useStore((s) => s.selectEvent);
  const point = isPointEvent(event);
  const duration = endMin - startMin;
  const start = new Date(event.start);

  const style = {
    '--ev': color,
    top: `min(calc(var(--hour-h) * ${startMin / 60}), calc(var(--hour-h) * 24 - 20px))`,
    height: point ? undefined : `max(20px, calc(var(--hour-h) * ${duration / 60} - 2px))`,
    left: `${(slot.col / slot.cols) * 100}%`,
    width: `calc(${(slot.span / slot.cols) * 100}% - 2px)`,
  } as CSSProperties;

  const cls = ['tg-event', point && 'point', done && 'done', !point && duration < TWO_LINE_MIN && 'compact', !point && duration >= TALL_MIN && 'tall']
    .filter(Boolean)
    .join(' ');
  const timeLabel = point
    ? shortTime(start)
    : `${shortTime(start)} – ${shortTime(new Date(event.end))}`;

  return (
    <button
      className={cls}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        selectEvent(event.id);
      }}
      title={`${event.title}\n${timeLabel}${event.location ? `\n${event.location}` : ''}`}
    >
      {point && <Icon name={done ? 'task_alt' : 'assignment'} size={14} />}
      <span className="tg-event-title">{event.title || '(No title)'}</span>
      <span className="tg-event-time">{timeLabel}</span>
    </button>
  );
}

function AllDayRow({ days, events }: { days: Date[]; events: CalEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const bars = useMemo(
    () =>
      layoutBars(
        events.flatMap((e) => {
          const idx = barIndexes(e, days);
          return idx ? [{ id: e.id, event: e, ...idx }] : [];
        }),
      ),
    [events, days],
  );
  const laneCount = bars.reduce((m, b) => Math.max(m, b.lane + 1), 0);
  const collapsible = laneCount > MAX_ALLDAY_LANES + 1;
  const visibleLanes = collapsible && !expanded ? MAX_ALLDAY_LANES : laneCount;
  const hiddenPerDay = days.map((_, i) =>
    bars.filter((b) => b.lane >= visibleLanes && b.startIdx <= i && b.endIdx >= i).length,
  );

  return (
    <div className="tg-allday">
      <div className="tg-gutter tg-allday-gutter">
        {collapsible && (
          <button
            className="icon-btn small"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse all-day events' : 'Expand all-day events'}
          >
            <Icon name={expanded ? 'expand_less' : 'expand_more'} />
          </button>
        )}
      </div>
      <div className="tg-allday-grid">
        {days.map((d, i) => (
          <div key={d.getTime()} className="tg-allday-cell" style={{ gridColumn: i + 1 }} />
        ))}
        {bars
          .filter((b) => b.lane < visibleLanes)
          .map((b) => (
            <AllDayBar
              key={b.id}
              event={b.event}
              style={{ gridColumn: `${b.startIdx + 1} / ${b.endIdx + 2}`, gridRow: b.lane + 1 }}
              clippedStart={new Date(b.event.start) < days[b.startIdx]}
            />
          ))}
        {hiddenPerDay.map((n, i) =>
          n ? (
            <button
              key={i}
              className="tg-allday-more"
              style={{ gridColumn: i + 1, gridRow: visibleLanes + 1 }}
              onClick={() => setExpanded(true)}
            >
              +{n} more
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}

function AllDayBar({ event, style, clippedStart }: { event: CalEvent; style: CSSProperties; clippedStart: boolean }) {
  const color = useCalendarColor(event.calendarId);
  const done = useStore((s) => !!s.done[event.uid]);
  const selectEvent = useStore((s) => s.selectEvent);
  const assignment = event.kind === 'assignment';
  return (
    <button
      className={`tg-bar${done ? ' done' : ''}${clippedStart ? ' clipped' : ''}`}
      style={{ ...style, '--ev': color } as CSSProperties}
      onClick={() => selectEvent(event.id)}
      title={event.title}
    >
      {assignment && <Icon name={done ? 'task_alt' : 'assignment'} size={14} />}
      <span>{event.title || '(No title)'}</span>
    </button>
  );
}
