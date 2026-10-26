import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { addDays, format, isToday, startOfDay } from 'date-fns';
import { isDone, useStore } from '../../store';
import { useCalendarColor, useVisibleEvents } from '../../store/selectors';
import { agendaTime, eventDayRange } from '../../lib/time';
import type { CalEvent } from '../../types';
import Icon from '../Icon';
import './AgendaView.css';

const PAGE_DAYS = 30;

interface DayGroup {
  day: Date;
  events: CalEvent[];
}

/** Group events by local day; multi-day events appear on every day they cover inside [from, to). */
function groupByDay(events: CalEvent[], from: number, to: number): DayGroup[] {
  const groups = new Map<number, CalEvent[]>();
  for (const e of events) {
    const [first, last] = eventDayRange(e);
    for (let d = Math.max(first.getTime(), from); d <= last.getTime() && d < to; d = addDays(d, 1).getTime()) {
      const list = groups.get(d);
      if (list) list.push(e);
      else groups.set(d, [e]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([d, list]) => ({
      day: new Date(d),
      events: list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)),
    }));
}

export default function AgendaView() {
  const cursorIso = useStore((s) => s.cursor);
  const search = useStore((s) => s.search.trim());
  const events = useVisibleEvents();
  const [pages, setPages] = useState(1);

  const from = startOfDay(new Date(cursorIso)).getTime();
  useEffect(() => setPages(1), [from]);
  const to = addDays(from, PAGE_DAYS * pages).getTime();

  const groups = useMemo(
    // While searching, show every match regardless of date.
    () => (search ? groupByDay(events, -Infinity, Infinity) : groupByDay(events, from, to)),
    [events, search, from, to],
  );
  const total = search ? events.length : 0;
  const hasLater = !search && events.some((e) => Date.parse(e.start) >= to);

  return (
    <div className="agenda">
      {search && (
        <p className="agenda-count" role="status">
          {total} {total === 1 ? 'result' : 'results'} for “{search}”
        </p>
      )}
      {groups.length === 0 ? (
        <div className="empty-state">
          <Icon name={search ? 'search_off' : 'event_available'} />
          <p>{search ? 'No events match your search.' : `Nothing scheduled in the next ${PAGE_DAYS * pages} days.`}</p>
        </div>
      ) : (
        <ol className="agenda-list">
          {groups.map((g) => (
            <li key={g.day.getTime()} className={`agenda-day${isToday(g.day) ? ' today' : ''}`}>
              <div className="agenda-date">
                <span className="agenda-date-num">{format(g.day, 'd')}</span>
                <span className="agenda-date-meta">{format(g.day, search ? 'MMM yyyy, EEE' : 'MMM, EEE')}</span>
              </div>
              <ul className="agenda-events">
                {g.events.map((e) => (
                  <AgendaRow key={e.id} event={e} day={g.day} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {hasLater && (
        <div className="agenda-more">
          <button className="outline-btn" onClick={() => setPages(pages + 1)}>
            Show more
          </button>
        </div>
      )}
    </div>
  );
}

function AgendaRow({ event, day }: { event: CalEvent; day: Date }) {
  const color = useCalendarColor(event.calendarId);
  const done = useStore((s) => isDone(s, event.uid));
  const selectEvent = useStore((s) => s.selectEvent);
  const sub = [event.course, event.location].filter(Boolean).join(' · ');
  return (
    <li>
      <button
        className={`agenda-row${done ? ' done' : ''}`}
        style={{ '--ev': color } as CSSProperties}
        onClick={() => selectEvent(event.id)}
      >
        {event.kind === 'assignment' ? (
          <Icon name={done ? 'task_alt' : 'assignment'} size={16} className="agenda-icon" />
        ) : (
          <span className="agenda-dot" aria-hidden="true" />
        )}
        <span className="agenda-time">{agendaTime(event, day)}</span>
        <span className="agenda-main">
          <span className="agenda-title">{event.title || '(No title)'}</span>
          {sub && <span className="agenda-sub">{sub}</span>}
        </span>
      </button>
    </li>
  );
}
