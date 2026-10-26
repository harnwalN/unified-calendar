import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { syncAll } from '../sources/sync';
import { PALETTE } from '../config';
import { checkFeedUrl } from '../features/feedUrl';
import Icon from './Icon';
import './Settings.css';

/** How to find the Canvas Calendar Feed link + paste field. Used by Settings and Onboarding. */
export default function SettingsCanvasForm() {
  const feeds = useStore((s) => s.feeds);
  const addFeed = useStore((s) => s.addFeed);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const check = url.trim() ? checkFeedUrl(url, 'canvas') : null;
  const duplicate = check?.ok && feeds.some((f) => f.url === check.url);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = checkFeedUrl(url, 'canvas');
    if (!result.ok) return setError(result.error);
    if (duplicate) return setError('This feed is already added.');
    addFeed({
      id: crypto.randomUUID(),
      kind: 'canvas',
      url: result.url,
      name: 'Canvas',
      color: PALETTE[feeds.length % PALETTE.length],
    });
    setUrl('');
    setError(null);
    setAdded(true);
    void syncAll();
  };

  return (
    <div className="s-stack">
      <ol className="s-steps">
        <li>
          <span>Open your school’s Canvas in a browser and click <b>Calendar</b> in the left menu.</span>
        </li>
        <li>
          <span>At the bottom right of the calendar page, click <b>Calendar Feed</b>.</span>
        </li>
        <li>
          <span>Copy the link it shows (it contains <code>/feeds/calendars/</code>) and paste it below.</span>
        </li>
      </ol>

      <form onSubmit={submit} noValidate>
        <div className="s-row">
          <label className="s-field">
            <span>Canvas Calendar Feed link</span>
            <input
              className="s-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://canvas.school.edu/feeds/calendars/user_….ics"
              value={url}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
                setAdded(false);
              }}
            />
          </label>
          <button className="s-btn s-btn--filled" type="submit" disabled={!url.trim()}>
            Add
          </button>
        </div>
        {error && (
          <p className="s-msg s-msg--error" role="alert"><Icon name="error" /> {error}</p>
        )}
        {!error && check?.ok && check.warning && (
          <p className="s-msg s-msg--warn"><Icon name="warning" /> {check.warning}</p>
        )}
        {added && !url && (
          <p className="s-msg s-msg--ok" role="status"><Icon name="check_circle" /> Feed added – your assignments are syncing.</p>
        )}
      </form>

      <div className="s-note">
        <Icon name="lock" />
        <span>
          This private link lets the app read your Canvas calendar (assignments and events) – treat it like a password.
          It is stored only in this browser. Each course shows up as its own calendar; at more than one school? Add each school’s feed.
        </span>
      </div>
    </div>
  );
}
