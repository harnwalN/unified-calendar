import { useMemo } from 'react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import { useVisibleEvents } from '../../store/selectors';
import { daysFrom } from '../../lib/time';
import type { TaskView } from '../../types';
import Icon from '../Icon';
import { dayLoads } from './grouping';
import './WeekStrip.css';

/** Busy-ness dots: one per two events, up to four. */
const dotsFor = (events: number) => Math.min(4, Math.ceil(events / 2));

/** Seven days from today with a load indicator; picking one opens the day view. */
export default function WeekStrip({ tasks, now }: { tasks: TaskView[]; now: Date }) {
  const events = useVisibleEvents();
  const calendarOpen = useStore((s) => s.calendarOpen);
  const view = useStore((s) => s.view);
  const cursor = useStore((s) => s.cursor);
  const today = startOfDay(now).getTime();
  const loads = useMemo(() => dayLoads(daysFrom(new Date(today), 7), events, tasks), [today, events, tasks]);

  const pick = (d: Date) => {
    const s = useStore.getState();
    s.setCursor(d);
    s.setView('day');
    s.setCalendarOpen(true);
  };

  return (
    <section className="week-strip" aria-label="Next 7 days">
      <div className="week-strip-head">
        <h2>Next 7 days</h2>
        <button
          className="text-btn"
          onClick={() => useStore.getState().setCalendarOpen(!calendarOpen)}
          aria-expanded={calendarOpen}
          aria-controls="calendar-panel"
          title="Toggle calendar (C)"
        >
          <Icon name="calendar_month" />
          {calendarOpen ? 'Hide calendar' : 'Show calendar'}
          <Icon name={calendarOpen ? 'expand_less' : 'expand_more'} />
        </button>
      </div>
      <ol className="week-strip-days">
        {loads.map(({ date, events: n, tasksDue }, i) => {
          const selected = calendarOpen && view === 'day' && isSameDay(date, new Date(cursor));
          const label = `${format(date, 'EEEE, MMMM d')}: ${n} event${n === 1 ? '' : 's'}, ${tasksDue} task${tasksDue === 1 ? '' : 's'} due`;
          return (
            <li key={date.getTime()}>
              <button
                className={`ws-day${i === 0 ? ' today' : ''}${selected ? ' selected' : ''}`}
                onClick={() => pick(date)}
                aria-label={label}
                aria-current={i === 0 ? 'date' : undefined}
                title={label}
              >
                <span className="ws-wd">{format(date, 'EEE')}</span>
                <span className="ws-num">{format(date, 'd')}</span>
                <span className="ws-dots" aria-hidden="true">
                  {Array.from({ length: dotsFor(n) }, (_, k) => (
                    <span key={k} />
                  ))}
                </span>
                <span className={`ws-due${tasksDue ? '' : ' none'}`} aria-hidden="true">
                  {tasksDue ? `${tasksDue} due` : '·'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
