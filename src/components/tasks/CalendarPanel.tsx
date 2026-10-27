import { useStore } from '../../store';
import type { ViewMode } from '../../types';
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

/** The classic calendar, expanded below the planner (which owns date navigation). */
export default function CalendarPanel() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  return (
    <section id="calendar-panel" className="calendar-panel" aria-label="Calendar">
      <div className="cp-bar">
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
