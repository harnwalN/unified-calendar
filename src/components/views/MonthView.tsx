import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { format, isSameMonth, isToday, startOfMonth } from 'date-fns';
import { isDone, useStore } from '../../store';
import { useCalendarColor, useVisibleEvents } from '../../store/selectors';
import { eventTouchesDay, isAllDayRow, isPointEvent, monthGridDays, shortTime, weekdayLabels } from '../../lib/time';
import type { CalEvent } from '../../types';
import Icon from '../Icon';
import './MonthView.css';

const CELL_HEAD_PX = 30;
const CHIP_PX = 22;

/** How many chips fit in one cell, recomputed whenever the grid resizes. */
function useChipCapacity(ref: RefObject<HTMLDivElement | null>): number {
  const [cap, setCap] = useState(3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const rowH = entry.contentRect.height / 6;
      setCap(Math.max(1, Math.floor((rowH - CELL_HEAD_PX) / CHIP_PX)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cap;
}

/** Banner-style items (all-day, multi-day) first, then by start time. */
function dayOrder(a: CalEvent, b: CalEvent): number {
  return Number(isAllDayRow(b)) - Number(isAllDayRow(a)) || a.start.localeCompare(b.start);
}

export default function MonthView() {
  const cursorIso = useStore((s) => s.cursor);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const setCursor = useStore((s) => s.setCursor);
  const setView = useStore((s) => s.setView);
  const events = useVisibleEvents();
  const gridRef = useRef<HTMLDivElement>(null);
  const capacity = useChipCapacity(gridRef);

  const cursor = new Date(cursorIso);
  const monthStart = startOfMonth(cursor).getTime();
  const days = useMemo(() => monthGridDays(new Date(monthStart), weekStartsOn), [monthStart, weekStartsOn]);
  const perDay = useMemo(
    () => days.map((d) => events.filter((e) => eventTouchesDay(e, d)).sort(dayOrder)),
    [days, events],
  );

  const openDay = (d: Date) => {
    setCursor(d);
    setView('day');
  };

  return (
    <div className="month">
      <div className="month-wd" aria-hidden="true">
        {weekdayLabels(weekStartsOn).map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="month-grid" ref={gridRef}>
        {days.map((d, i) => {
          const list = perDay[i];
          const shown = list.length > capacity ? list.slice(0, capacity - 1) : list;
          const more = list.length - shown.length;
          return (
            <div
              key={d.getTime()}
              className={`month-cell${isSameMonth(d, cursor) ? '' : ' outside'}`}
              role="group"
              aria-label={format(d, 'EEEE, MMMM d')}
            >
              <button
                className={`month-date${isToday(d) ? ' today' : ''}`}
                onClick={() => openDay(d)}
                aria-label={`${format(d, 'EEEE, MMMM d')}, open day`}
              >
                {d.getDate() === 1 ? format(d, 'MMM d') : format(d, 'd')}
              </button>
              <div className="month-chips">
                {shown.map((e) => (
                  <MonthChip key={e.id} event={e} />
                ))}
                {more > 0 && (
                  <button className="month-more" onClick={() => openDay(d)}>
                    +{more} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthChip({ event }: { event: CalEvent }) {
  const color = useCalendarColor(event.calendarId);
  const done = useStore((s) => isDone(s, event.uid));
  const selectEvent = useStore((s) => s.selectEvent);
  const assignment = event.kind === 'assignment';
  const filled = isAllDayRow(event) || assignment;
  const showTime = !filled || isPointEvent(event);

  return (
    <button
      className={`month-chip${filled ? ' filled' : ''}${done ? ' done' : ''}`}
      style={{ '--ev': color } as CSSProperties}
      onClick={() => selectEvent(event.id)}
      title={event.title}
    >
      {assignment ? (
        <Icon name={done ? 'task_alt' : 'assignment'} size={14} />
      ) : (
        !filled && <span className="month-dot" aria-hidden="true" />
      )}
      {showTime && <span className="month-chip-time">{shortTime(new Date(event.start))}</span>}
      <span className="month-chip-title">{event.title || '(No title)'}</span>
    </button>
  );
}
