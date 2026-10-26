import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import Icon from './Icon';
import SettingsGoogleAccounts from './SettingsGoogleAccounts';
import SettingsCanvasForm from './SettingsCanvasForm';
import SettingsFeedList from './SettingsFeedList';
import SettingsIcsForm from './SettingsIcsForm';
import SettingsReminders from './SettingsReminders';
import SettingsAppearance from './SettingsAppearance';
import SettingsPrivacy from './SettingsPrivacy';
import SettingsDriveSync from './SettingsDriveSync';
import SettingsClasses from './SettingsClasses';
import SettingsGradescope from './SettingsGradescope';
import SettingsPrairieLearn from './SettingsPrairieLearn';
import './Settings.css';
import './SettingsDialog.css';

interface Section {
  id: string;
  label: string;
  icon: string;
  description: string;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'google', label: 'Google accounts', icon: 'account_circle',
    description: 'Show events from one or more Google Calendars.',
    body: <SettingsGoogleAccounts />,
  },
  {
    id: 'sync', label: 'Sync', icon: 'cloud_sync',
    description: 'Keep tasks, plans and time logs in step across your devices.',
    body: <SettingsDriveSync />,
  },
  {
    id: 'classes', label: 'Classes', icon: 'class',
    description: 'How your assignments and tasks are grouped on the home screen.',
    body: <SettingsClasses />,
  },
  {
    id: 'canvas', label: 'Canvas', icon: 'school',
    description: 'Add your Canvas assignments using your personal Calendar Feed link.',
    body: <div className="s-stack"><SettingsFeedList kind="canvas" /><SettingsCanvasForm /></div>,
  },
  {
    id: 'gradescope', label: 'Gradescope', icon: 'grading',
    description: 'Bring in Gradescope deadlines through Google Calendar.',
    body: <SettingsGradescope />,
  },
  {
    id: 'prairielearn', label: 'PrairieLearn', icon: 'bookmark_add',
    description: 'Import PrairieLearn assessment deadlines with a bookmark.',
    body: <SettingsPrairieLearn />,
  },
  {
    id: 'ics', label: 'Other calendars', icon: 'event_note',
    description: 'Subscribe to any calendar that has an .ics link.',
    body: <div className="s-stack"><SettingsFeedList kind="ics" /><SettingsIcsForm /></div>,
  },
  {
    id: 'reminders', label: 'Reminders', icon: 'notifications',
    description: 'Notifications before assignments are due.',
    body: <SettingsReminders />,
  },
  {
    id: 'appearance', label: 'Appearance', icon: 'palette',
    description: 'Theme, calendar display and background scene.',
    body: <SettingsAppearance />,
  },
  {
    id: 'privacy', label: 'Privacy & data', icon: 'shield',
    description: 'What’s stored and how to remove it.',
    body: <SettingsPrivacy />,
  },
];

export default function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const [active, setActive] = useState(SECTIONS[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, setOpen]);

  if (!open) return null;

  // Highlight the last section whose heading has scrolled past the top of the pane.
  const onScroll = () => {
    const pane = scrollRef.current;
    if (!pane) return;
    const top = pane.getBoundingClientRect().top + 80;
    let current = SECTIONS[0].id;
    for (const s of SECTIONS) {
      const el = pane.querySelector<HTMLElement>(`#settings-${s.id}`);
      if (el && el.getBoundingClientRect().top <= top) current = s.id;
    }
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1].id;
    setActive(current);
  };

  const jump = (id: string) => {
    setActive(id);
    scrollRef.current?.querySelector(`#settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="settings-scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings__header">
          <button ref={closeRef} className="s-icon-btn" aria-label="Close settings" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
          <h1 id="settings-title">Settings</h1>
        </header>

        <div className="settings__body">
          <nav className="settings__nav" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button key={s.id} className="settings__nav-item" aria-current={active === s.id} onClick={() => jump(s.id)}>
                <Icon name={s.icon} />
                {s.label}
              </button>
            ))}
          </nav>

          <div className="settings__content" ref={scrollRef} onScroll={onScroll}>
            {SECTIONS.map((s) => (
              <section key={s.id} id={`settings-${s.id}`} className="settings__section" aria-labelledby={`settings-${s.id}-h`}>
                <h2 id={`settings-${s.id}-h`}>
                  <Icon name={s.icon} /> {s.label}
                </h2>
                <p className="settings__desc">{s.description}</p>
                {s.body}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
