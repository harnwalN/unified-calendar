import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { syncAll } from '../sources/sync';
import { PALETTE } from '../config';
import { checkFeedUrl } from '../features/feedUrl';
import Icon from './Icon';
import './Settings.css';

const HOLIDAYS_URL = 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics';

/** Add any public/secret .ics subscription link with a name and color. */
export default function SettingsIcsForm() {
  const feeds = useStore((s) => s.feeds);
  const addFeed = useStore((s) => s.addFeed);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState(() => PALETTE[(feeds.length + 4) % PALETTE.length]);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = checkFeedUrl(url, 'ics');
    if (!result.ok) return setError(result.error);
    if (feeds.some((f) => f.url === result.url)) return setError('This calendar is already added.');
    addFeed({ id: crypto.randomUUID(), kind: 'ics', url: result.url, name: name.trim() || result.host, color });
    setName('');
    setUrl('');
    setError(null);
    setColor(PALETTE[(feeds.length + 5) % PALETTE.length]);
    void syncAll();
  };

  return (
    <form className="s-stack" onSubmit={submit} noValidate>
      <div className="s-row">
        <label className="s-field" style={{ flexBasis: 160 }}>
          <span>Name</span>
          <input className="s-input" value={name} placeholder="e.g. Club meetings" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="s-field">
          <span>Calendar link (.ics, webcal or https)</span>
          <input
            className="s-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…/calendar.ics"
            value={url}
            aria-invalid={Boolean(error)}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
          />
        </label>
      </div>
      <div className="s-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="s-swatches" role="radiogroup" aria-label="Color">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className="s-swatch"
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              style={{ background: c }}
              onClick={() => setColor(c)}
            >
              {c === color && <Icon name="check" />}
            </button>
          ))}
        </div>
        <button className="s-btn s-btn--filled" type="submit" disabled={!url.trim()}>
          Add calendar
        </button>
      </div>
      {error && <p className="s-msg s-msg--error" role="alert"><Icon name="error" /> {error}</p>}
      <div className="s-note">
        <Icon name="lightbulb" />
        <span>
          Any calendar that offers an iCal / .ics link works – sports schedules, Outlook “publish calendar” links,
          school calendars. Example: US holidays{' '}
          <button
            type="button"
            className="s-btn s-btn--small"
            onClick={() => {
              setName('US Holidays');
              setUrl(HOLIDAYS_URL);
              setError(null);
            }}
          >
            Use this example
          </button>
        </span>
      </div>
    </form>
  );
}
