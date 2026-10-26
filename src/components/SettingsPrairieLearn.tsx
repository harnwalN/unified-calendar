import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceStrict } from 'date-fns';
import { useStore } from '../store';
import { bookmarkletSource } from '../sources/prairielearn';
import { useNow } from '../features/useNow';
import Icon from './Icon';
import './Settings.css';
import './SettingsSources.css';

/** Settings → PrairieLearn: the "Send to Calendar" bookmarklet and the courses imported with it. */
export default function SettingsPrairieLearn() {
  const imports = useStore((s) => s.imports);
  const deleteImport = useStore((s) => s.deleteImport);
  const now = useNow();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => bookmarkletSource(`${location.origin}${import.meta.env.BASE_URL}`), []);
  const courses = Object.values(imports)
    .filter((i) => !i.deleted && i.kind === 'prairielearn')
    .sort((a, b) => a.name.localeCompare(b.name));

  // React refuses to render javascript: URLs, so set it on the DOM node directly.
  useEffect(() => {
    linkRef.current?.setAttribute('href', code);
  }, [code]);

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="s-stack">
      <ol className="s-steps">
        <li>
          <span>
            Drag this button to your bookmarks bar:
            <span className="src-links">
              <a
                ref={linkRef}
                className="s-btn s-btn--tonal src-bookmarklet"
                onClick={(e) => e.preventDefault()}
                title="Drag me to your bookmarks bar"
              >
                <Icon name="bookmark_add" /> Send to Calendar
              </a>
              <button type="button" className="s-btn s-btn--small" onClick={copy}>
                <Icon name={copied ? 'check' : 'content_copy'} /> {copied ? 'Copied' : 'Copy code'}
              </button>
            </span>
            <span className="src-hint">
              Can’t drag (e.g. on a phone)? Copy the code, create any bookmark and paste it as the bookmark’s URL.
            </span>
          </span>
        </li>
        <li>
          <span>
            On PrairieLearn, open a course’s <b>Assessments</b> page and click the <b>Send to Calendar</b> bookmark.
          </span>
        </li>
        <li>
          <span>
            This app opens and adds the deadlines as assignments. Click the bookmark again whenever deadlines change — the
            course is updated in place and your progress is kept.
          </span>
        </li>
      </ol>

      {courses.length > 0 && (
        <ul className="s-list" aria-label="Imported PrairieLearn courses">
          {courses.map((c) => (
            <li className="s-item" key={c.id}>
              <span className="src-icon" aria-hidden="true"><Icon name="school" /></span>
              <div className="s-item__main">
                <div className="s-item__title">{c.name}</div>
                <div className="s-item__sub">
                  {c.events.length} {c.events.length === 1 ? 'assessment' : 'assessments'} · imported{' '}
                  {now.getTime() - c.importedAt < 60_000 ? 'just now' : `${formatDistanceStrict(c.importedAt, now)} ago`}
                </div>
              </div>
              <div className="s-item__actions">
                {c.url && (
                  <a className="s-icon-btn s-icon-btn--small" href={c.url} target="_blank" rel="noreferrer" aria-label={`Open ${c.name} on PrairieLearn`} title="Open on PrairieLearn">
                    <Icon name="open_in_new" />
                  </a>
                )}
                <button
                  type="button"
                  className="s-btn s-btn--danger s-btn--small"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => {
                    if (confirm(`Remove “${c.name}” and its ${c.events.length} assessments?`)) deleteImport(c.id);
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
