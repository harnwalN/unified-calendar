import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { useStore, sourceKeyFor } from '../store';
import type { CalendarInfo } from '../types';
import Icon from './Icon';
import ColorPicker from './ColorPicker';
import ClassCards from './tasks/ClassCards';
import { DRAWER_QUERY, useMediaQuery } from './hooks';
import './Sidebar.css';

interface Group {
  key: string;
  title: string;
  calendars: CalendarInfo[];
}

function groupCalendars(calendars: CalendarInfo[], accounts: { id: string; email: string }[]): Group[] {
  const byName = (a: CalendarInfo, b: CalendarInfo) => a.name.localeCompare(b.name);
  const groups: Group[] = accounts.map((a) => ({
    key: sourceKeyFor.google(a.id),
    title: a.email,
    calendars: calendars.filter((c) => c.sourceKey === sourceKeyFor.google(a.id)).sort(byName),
  }));
  const claimed = new Set(groups.map((g) => g.key));
  groups.push(
    {
      key: 'google',
      title: 'Google Calendar',
      calendars: calendars.filter((c) => c.kind === 'google' && !claimed.has(c.sourceKey)).sort(byName),
    },
    { key: 'canvas', title: 'Canvas', calendars: calendars.filter((c) => c.kind === 'canvas').sort(byName) },
    { key: 'ics', title: 'Other calendars', calendars: calendars.filter((c) => c.kind === 'ics').sort(byName) },
  );
  return groups.filter((g) => g.calendars.length);
}

export default function Sidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const drawer = useMediaQuery(DRAWER_QUERY);

  // Phones/tablets start with the drawer closed; layout effect avoids a flash of the open drawer.
  useLayoutEffect(() => {
    if (window.matchMedia(DRAWER_QUERY).matches) setSidebarOpen(false);
  }, [setSidebarOpen]);

  const close = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  useEffect(() => {
    if (!drawer || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, open, close]);

  const openSettings = () => {
    useStore.getState().setSettingsOpen(true);
    if (drawer) close();
  };

  return (
    <>
      {drawer && open && <div className="scrim sidebar-scrim" onClick={close} />}
      <aside
        className={`sidebar${open ? ' open' : ''}${drawer ? ' drawer' : ''}`}
        aria-label="Sidebar"
        inert={!open}
      >
        <div className="sidebar-inner">
          {drawer && (
            <div className="sidebar-drawer-head">
              <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={32} height={32} />
              <span>Calendar</span>
              <button className="icon-btn" onClick={close} aria-label="Close menu">
                <Icon name="close" />
              </button>
            </div>
          )}
          <ClassCards onPick={drawer ? close : undefined} />
          <CalendarList onConnect={openSettings} />
          <div className="sidebar-footer">
            <button className="sidebar-link" onClick={openSettings}>
              <Icon name="settings" />
              <span>Settings &amp; sources</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function CalendarList({ onConnect }: { onConnect: () => void }) {
  const calendarMap = useStore((s) => s.calendars);
  const accounts = useStore((s) => s.accounts);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = groupCalendars(Object.values(calendarMap), accounts);

  if (!groups.length) {
    return (
      <section className="sidebar-section sidebar-empty">
        <p>No calendars yet. Add Google accounts, your Canvas calendar feed or any .ics link.</p>
        <button className="filled-btn" onClick={onConnect}>
          <Icon name="add_link" />
          Connect calendars
        </button>
      </section>
    );
  }

  return (
    <section className="sidebar-section" aria-label="My calendars">
      <h2 className="sidebar-heading">My calendars</h2>
      {groups.map((g) => {
        const isCollapsed = collapsed[g.key];
        return (
          <div key={g.key} className="cal-group">
            <button
              className="cal-group-head"
              onClick={() => setCollapsed({ ...collapsed, [g.key]: !isCollapsed })}
              aria-expanded={!isCollapsed}
              title={g.title}
            >
              <span>{g.title}</span>
              <Icon name={isCollapsed ? 'expand_more' : 'expand_less'} />
            </button>
            {!isCollapsed && (
              <ul className="cal-list">
                {g.calendars.map((c) => (
                  <CalendarRow key={c.id} cal={c} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function CalendarRow({ cal }: { cal: CalendarInfo }) {
  const updateCalendar = useStore((s) => s.updateCalendar);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const closePicker = useCallback(() => setAnchor(null), []);

  return (
    <li className="cal-row" style={{ '--cal-color': cal.color } as CSSProperties}>
      <label className="cal-check" title={cal.name}>
        <input
          type="checkbox"
          checked={cal.visible}
          onChange={(e) => updateCalendar(cal.id, { visible: e.target.checked })}
        />
        <span className="cal-box" aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
        <span className="cal-name">{cal.name}</span>
      </label>
      <button
        className="icon-btn small cal-color-btn"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        aria-label={`Change color for ${cal.name}`}
        aria-expanded={!!anchor}
        title="Change color"
      >
        <Icon name="palette" />
      </button>
      {anchor && (
        <ColorPicker
          anchor={anchor}
          value={cal.color}
          onPick={(color) => updateCalendar(cal.id, { color })}
          onClose={closePicker}
        />
      )}
    </li>
  );
}
