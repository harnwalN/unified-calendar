import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { format } from 'date-fns';
import { sourceKeyFor, useStore } from '../store';
import type { GoogleAccount, IcsFeed, ViewMode } from '../types';
import Icon from './Icon';
import TimerPill from './time/TimerPill';
import StartTimerMenu from './time/StartTimerMenu';
import SceneMenu from './scenery/SceneMenu';
import { openFloating, useFloatingWindow } from '../features/floating';
import { timeOfDayColor } from '../features/favicon';
import { useNarrowDays, useNow } from './hooks';
import { useShortcuts } from './useShortcuts';
import './TopBar.css';

const VIEWS: { id: ViewMode; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'month', label: 'Month', key: 'M' },
  { id: 'agenda', label: 'Agenda', key: 'A' },
];

export default function TopBar() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const calendarOpen = useStore((s) => s.calendarOpen);
  const timing = useStore((s) => s.runningTimer !== null);
  const narrowDays = useNarrowDays();

  const searchRef = useRef<HTMLInputElement>(null);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const focusSearch = useCallback(() => {
    setSearchExpanded(true);
    // Wait for the expanded input to render on phones.
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);
  useShortcuts(focusSearch, narrowDays);

  return (
    <header className={`topbar${timing ? ' timing' : ''}${calendarOpen ? ' calendar' : ''}`}>
      <div className="topbar-start">
        <button
          className="icon-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Main menu"
          aria-expanded={sidebarOpen}
          title="Main menu"
        >
          <Icon name="menu" />
        </button>
        <div className="topbar-brand">
          <BrandIcon />
          <span>Calendar</span>
        </div>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-end">
        {timing ? <TimerPill /> : <StartTimerMenu />}
        <SearchBox inputRef={searchRef} expanded={searchExpanded} setExpanded={setSearchExpanded} />
        <Clock />
        <SyncIndicator />
        {calendarOpen && <ViewMenu />}
        <MiniWindowButton />
        <button
          className="icon-btn topbar-time"
          onClick={() => useStore.getState().setTimePageOpen(true)}
          aria-label="Time stats"
          title="Time stats: where your time went today and this week"
        >
          <Icon name="bar_chart" />
        </button>
        <SceneMenu />
        <Accounts />
        <button
          className="icon-btn topbar-settings"
          onClick={() => useStore.getState().setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}

function SearchBox({
  inputRef,
  expanded,
  setExpanded,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const open = expanded || search !== '';

  return (
    <div className={`topbar-search${open ? ' open' : ''}`} role="search">
      <button
        className="icon-btn topbar-search-toggle"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label="Search"
        title="Search (/)"
      >
        <Icon name="search" />
      </button>
      <label className="topbar-search-field">
        <Icon name="search" className="topbar-search-icon" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search events"
          aria-label="Search events"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => setExpanded(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setSearch('');
              setExpanded(false);
              e.currentTarget.blur();
            } else if (e.key === 'Enter' && search.trim()) {
              useStore.getState().setView('agenda');
            }
          }}
        />
        {open && (
          <button
            className="icon-btn small"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setSearch('');
              setExpanded(false);
            }}
            aria-label="Clear search"
          >
            <Icon name="close" />
          </button>
        )}
      </label>
    </div>
  );
}

/** Pops out the floating mini window (timer + today's tasks) that stays visible over other tabs. */
function MiniWindowButton() {
  const open = useFloatingWindow() !== null;
  const [blocked, setBlocked] = useState(false);
  return (
    <button
      className={`icon-btn topbar-mini${open ? ' active' : ''}`}
      onClick={async () => setBlocked(!(await openFloating()))}
      aria-label="Mini window"
      aria-pressed={open}
      title={
        blocked
          ? 'Your browser blocked the mini window. Allow pop-ups for this site and try again.'
          : 'Mini window: your timer and today’s tasks, floating over other tabs'
      }
    >
      <Icon name={blocked ? 'block' : 'picture_in_picture_alt'} />
    </button>
  );
}

/** Logo = today's live date tile (same design as the tab icon), set in the UI font. */
function BrandIcon() {
  const now = useNow(60_000);
  return (
    <span className="brand-tile" style={{ '--tile-color': timeOfDayColor(now) } as CSSProperties} aria-hidden="true">
      <span className="brand-tile-num">{now.getDate()}</span>
    </span>
  );
}

function Clock() {
  const now = useNow(1000);
  return (
    <time className="topbar-clock" dateTime={now.toISOString()} aria-label="Current time">
      <span className="topbar-clock-time">
        {format(now, 'h:mm:ss')}
        <span className="topbar-clock-ampm"> {format(now, 'a')}</span>
      </span>
      <span className="topbar-clock-date"> · {format(now, 'EEE, MMM d')}</span>
    </time>
  );
}

/** Human-readable name for a source key: the account email or the feed's name. */
function sourceLabel(key: string, accounts: GoogleAccount[], feeds: IcsFeed[]): string {
  const account = accounts.find((a) => sourceKeyFor.google(a.id) === key);
  if (account) return account.email || account.name || 'Google account';
  const feed = feeds.find((f) => sourceKeyFor.feed(f) === key);
  if (feed) return feed.name || (feed.kind === 'canvas' ? 'Canvas' : 'Calendar feed');
  return key;
}

function SyncIndicator() {
  const syncStatus = useStore((s) => s.syncStatus);
  const accounts = useStore((s) => s.accounts);
  const feeds = useStore((s) => s.feeds);
  const entries = Object.entries(syncStatus);
  const loading = entries.some(([, st]) => st.state === 'loading');
  const errors = entries.filter(([, st]) => st.state === 'error');

  if (loading) {
    return (
      <span className="topbar-sync" role="status" title="Syncing…" aria-label="Syncing">
        <Icon name="sync" className="spin" />
      </span>
    );
  }
  if (errors.length) {
    const msg = errors
      .map(([key, st]) => `${sourceLabel(key, accounts, feeds)}: ${st.error ?? 'Sync failed'}`)
      .join('\n');
    return (
      <button
        className="icon-btn topbar-sync error"
        title={`Sync problems:\n${msg}`}
        aria-label={`Sync problems: ${msg}`}
        onClick={() => useStore.getState().setSettingsOpen(true)}
      >
        <Icon name="sync_problem" />
      </button>
    );
  }
  return null;
}

function ViewMenu() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[1];
  return (
    <div className="view-menu" ref={ref}>
      <button
        className="outline-btn view-menu-btn"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`View: ${current.label}`}
      >
        <span className="view-menu-label">{current.label}</span>
        <Icon name="calendar_view_month" className="view-menu-icon" />
        <Icon name="arrow_drop_down" />
      </button>
      {open && (
        <ul className="menu" role="menu">
          {VIEWS.map((v) => (
            <li key={v.id} role="none">
              <button
                role="menuitemradio"
                aria-checked={v.id === view}
                className={v.id === view ? 'active' : undefined}
                onClick={() => {
                  setView(v.id);
                  setOpen(false);
                }}
              >
                <span>{v.label}</span>
                <kbd>{v.key}</kbd>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Accounts() {
  const accounts = useStore((s) => s.accounts);
  if (!accounts.length) return null;
  return (
    <div className="topbar-accounts">
      {accounts.map((a) => (
        <button
          key={a.id}
          className="avatar"
          title={a.needsReconnect ? `${a.email} — reconnect needed` : a.email}
          aria-label={a.needsReconnect ? `${a.email}, reconnect needed` : a.email}
          onClick={() => useStore.getState().setSettingsOpen(true)}
        >
          {a.picture ? (
            <img src={a.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span>{(a.name || a.email).charAt(0).toUpperCase()}</span>
          )}
          {a.needsReconnect && <span className="avatar-alert" />}
        </button>
      ))}
    </div>
  );
}
