import { useStore } from '../../store';
import { stepCursor, viewTitle } from '../../lib/time';
import type { ViewMode } from '../../types';
import Icon from '../Icon';
import { useNarrowDays } from '../hooks';
import DayView from '../views/DayView';
import WeekView from '../views/WeekView';
import MonthView from '../views/MonthView';
import AgendaView from '../views/AgendaView';
import './CalendarPanel.css';

const VIEWS: { id: ViewMode; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'month', label: 'Month', key: 'M' },
  { id: 'agenda', label: 'Agenda', key: 'A' },
];

/** The classic calendar, expanded below the week strip. */
export default function CalendarPanel() {
  const view = useStore((s) => s.view);
  const cursorIso = useStore((s) => s.cursor);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const setView = useStore((s) => s.setView);
  const setCursor = useStore((s) => s.setCursor);
  const narrowDays = useNarrowDays();
  const cursor = new Date(cursorIso);
  const unit = view === 'month' ? 'month' : view === 'day' ? 'day' : 'week';
  const step = (dir: 1 | -1) => setCursor(stepCursor(view, cursor, dir, narrowDays));

  return (
    <section id="calendar-panel" className="calendar-panel" aria-label="Calendar">
      <div className="cp-bar">
        <div className="cp-nav">
          <button className="outline-btn cp-today" onClick={() => setCursor(new Date())} title="Today (T)">
            Today
          </button>
          <button className="icon-btn small" onClick={() => step(-1)} aria-label={`Previous ${unit}`} title={`Previous ${unit} (K)`}>
            <Icon name="chevron_left" />
          </button>
          <button className="icon-btn small" onClick={() => step(1)} aria-label={`Next ${unit}`} title={`Next ${unit} (J)`}>
            <Icon name="chevron_right" />
          </button>
          <h2 className="cp-title" aria-live="polite">
            {viewTitle(view, cursor, weekStartsOn, narrowDays)}
          </h2>
        </div>
        <div className="cp-views" role="radiogroup" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={view === v.id}
              className={view === v.id ? 'active' : undefined}
              onClick={() => setView(v.id)}
              title={`${v.label} (${v.key})`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cp-body">
        {view === 'day' && <DayView />}
        {view === 'week' && <WeekView />}
        {view === 'month' && <MonthView />}
        {view === 'agenda' && <AgendaView />}
      </div>
    </section>
  );
}
