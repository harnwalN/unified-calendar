// Full-screen time stats dialog (open = store.timePageOpen): Today / Week / Estimates.
import { useEffect, useRef, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, isThisWeek, startOfDay, startOfWeek } from 'date-fns';
import { useStore } from '../../store';
import Icon from '../Icon';
import TodayTab from './TodayTab';
import WeekTab from './WeekTab';
import EstimatesTab from './EstimatesTab';
import './TimePage.css';

type Tab = 'today' | 'week' | 'estimates';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'estimates', label: 'Estimates' },
];

export default function TimePage() {
  const open = useStore((s) => s.timePageOpen);
  const setOpen = useStore((s) => s.setTimePageOpen);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const [tab, setTab] = useState<Tab>('today');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ today: null, week: null, estimates: null });

  useEffect(() => {
    if (!open) return;
    setAnchor(startOfDay(new Date()));
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, setOpen]);

  if (!open) return null;

  const now = new Date();
  const weekOpts = { weekStartsOn } as const;
  const weekStart = startOfWeek(anchor, weekOpts);
  const atPresent = tab === 'today' ? isSameDay(anchor, now) : isThisWeek(anchor, weekOpts);
  const move = (dir: 1 | -1) => setAnchor(tab === 'week' ? addWeeks(anchor, dir) : addDays(anchor, dir));
  const rangeLabel =
    tab === 'today'
      ? isSameDay(anchor, now)
        ? 'Today'
        : isSameDay(anchor, addDays(now, -1))
          ? 'Yesterday'
          : format(anchor, 'EEE, MMM d')
      : `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), weekStart.getMonth() === addDays(weekStart, 6).getMonth() ? 'd' : 'MMM d')}`;

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = TABS[(i + dir + TABS.length) % TABS.length].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="time-scrim" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="time-page" role="dialog" aria-modal="true" aria-labelledby="time-page-title">
        <header className="time-page-head">
          <button ref={closeRef} className="icon-btn" onClick={() => setOpen(false)} aria-label="Close" title="Close (Esc)">
            <Icon name="close" />
          </button>
          <h1 id="time-page-title">Time</h1>
          <div className="time-tabs" role="tablist" aria-label="Time views">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                role="tab"
                id={`time-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="time-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {tab !== 'estimates' && (
          <nav className="time-range" aria-label={tab === 'week' ? 'Week' : 'Day'}>
            <button className="icon-btn small" onClick={() => move(-1)} aria-label={`Previous ${tab === 'week' ? 'week' : 'day'}`}>
              <Icon name="chevron_left" />
            </button>
            <button
              className="icon-btn small"
              onClick={() => move(1)}
              disabled={atPresent}
              aria-label={`Next ${tab === 'week' ? 'week' : 'day'}`}
            >
              <Icon name="chevron_right" />
            </button>
            <h2 aria-live="polite">{rangeLabel}</h2>
            {!atPresent && (
              <button className="outline-btn time-range-today" onClick={() => setAnchor(startOfDay(new Date()))}>
                {tab === 'week' ? 'This week' : 'Today'}
              </button>
            )}
          </nav>
        )}

        <div className="time-panel" id="time-panel" role="tabpanel" aria-labelledby={`time-tab-${tab}`}>
          {tab === 'today' && <TodayTab day={anchor} />}
          {tab === 'week' && <WeekTab weekStart={weekStart} />}
          {tab === 'estimates' && <EstimatesTab />}
        </div>
      </div>
    </div>
  );
}

