import { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from '../store';
import { useAllEvents } from '../store/selectors';
import { formatDue, getDueSoon } from '../features/checklist';
import { useNow } from '../features/useNow';
import type { CalEvent } from '../types';
import Icon from './Icon';
import './DueSoon.css';

function DueRow({ event, color, done, overdue, now }: {
  event: CalEvent; color: string; done: boolean; overdue: boolean; now: Date;
}) {
  const toggleDone = useStore((s) => s.toggleDone);

  const open = () => {
    const s = useStore.getState();
    s.setCursor(new Date(event.start));
    s.selectEvent(event.id);
    if (window.matchMedia('(max-width: 768px)').matches) s.setSidebarOpen(false);
  };

  return (
    <li className="due__row" data-done={done || undefined} style={{ '--cal': color } as CSSProperties}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark “${event.title}” as ${done ? 'not done' : 'done'}`}
        className="due__check"
        onClick={() => toggleDone(event.uid)}
      >
        <span className="due__box">{done && <Icon name="check" size={16} />}</span>
      </button>
      <button type="button" className="due__main" onClick={open} title={event.title}>
        <span className="due__title">{event.title}</span>
        <span className="due__meta">
          {event.course && <span className="due__course">{event.course}</span>}
          <span className={overdue ? 'due__when due__when--overdue' : 'due__when'}>{formatDue(event.start, now)}</span>
        </span>
      </button>
    </li>
  );
}

/** Assignment checklist at the bottom of the sidebar. */
export default function DueSoon() {
  const events = useAllEvents();
  const calendars = useStore((s) => s.calendars);
  const done = useStore((s) => s.done);
  const now = useNow();
  const [showCompleted, setShowCompleted] = useState(false);

  const groups = useMemo(
    () => getDueSoon(events.filter((e) => calendars[e.calendarId]?.visible !== false), done, now),
    [events, calendars, done, now],
  );
  const pending = groups.overdue.length + groups.upcoming.length;
  const colorOf = (e: CalEvent) => calendars[e.calendarId]?.color ?? 'var(--primary)';

  return (
    <section className="due" aria-labelledby="due-heading">
      <h2 className="due__heading" id="due-heading">
        Due soon
        {pending > 0 && <span className="due__count">{pending}</span>}
      </h2>

      {pending === 0 ? (
        <p className="due__empty">
          <Icon name="task_alt" /> Nothing due in the next 2 weeks 🎉
        </p>
      ) : (
        <ul className="due__list">
          {groups.overdue.map((e) => (
            <DueRow key={e.id} event={e} color={colorOf(e)} done={false} overdue now={now} />
          ))}
          {groups.upcoming.map((e) => (
            <DueRow key={e.id} event={e} color={colorOf(e)} done={false} overdue={false} now={now} />
          ))}
        </ul>
      )}

      {groups.completed.length > 0 && (
        <>
          <button
            type="button"
            className="due__toggle"
            aria-expanded={showCompleted}
            onClick={() => setShowCompleted((v) => !v)}
          >
            <Icon name={showCompleted ? 'expand_less' : 'expand_more'} />
            Completed ({groups.completed.length})
          </button>
          {showCompleted && (
            <ul className="due__list">
              {groups.completed.map((e) => (
                <DueRow key={e.id} event={e} color={colorOf(e)} done overdue={false} now={now} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
