import { useState } from 'react';
import { useStore, sourceKeyFor } from '../store';
import { syncSource } from '../sources/sync';
import { feedHost } from '../features/feedUrl';
import type { IcsFeed } from '../types';
import Icon from './Icon';
import SettingsSyncStatus from './SettingsSyncStatus';
import './Settings.css';

function FeedRow({ feed }: { feed: IcsFeed }) {
  const updateFeed = useStore((s) => s.updateFeed);
  const removeFeed = useStore((s) => s.removeFeed);
  const calendars = useStore((s) => s.calendars);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(feed.name);
  const key = sourceKeyFor.feed(feed);

  const saveName = () => {
    const next = name.trim();
    setEditing(false);
    if (!next || next === feed.name) return setName(feed.name);
    updateFeed(feed.id, { name: next });
    // A plain .ics feed maps to a single calendar; rename it too so the sidebar updates immediately.
    const own = Object.values(calendars).filter((c) => c.sourceKey === key);
    if (feed.kind === 'ics' && own.length === 1) useStore.getState().updateCalendar(own[0].id, { name: next });
  };

  return (
    <li className="s-item">
      <span className="s-dot" style={{ background: feed.color }} aria-hidden="true" />
      <div className="s-item__main">
        {editing ? (
          <input
            className="s-input s-item__rename"
            value={name}
            autoFocus
            aria-label="Calendar name"
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setName(feed.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <div className="s-item__title">{feed.name}</div>
        )}
        <div className="s-item__sub" title={feed.url}>
          {feedHost(feed.url)} · <SettingsSyncStatus sourceKey={key} />
        </div>
      </div>
      <div className="s-item__actions">
        {!editing && (
          <button className="s-icon-btn s-icon-btn--small" title="Rename" aria-label={`Rename ${feed.name}`} onClick={() => setEditing(true)}>
            <Icon name="edit" />
          </button>
        )}
        <button className="s-icon-btn s-icon-btn--small" title="Sync now" aria-label={`Sync ${feed.name} now`} onClick={() => void syncSource(key)}>
          <Icon name="sync" />
        </button>
        <button
          className="s-icon-btn s-icon-btn--small"
          title="Remove"
          aria-label={`Remove ${feed.name}`}
          onClick={() => {
            if (confirm(`Remove “${feed.name}” and its events from this calendar?`)) removeFeed(feed.id);
          }}
        >
          <Icon name="delete" />
        </button>
      </div>
    </li>
  );
}

/** Subscribed feeds of one kind with sync status, sync-now, rename and remove. */
export default function SettingsFeedList({ kind }: { kind: IcsFeed['kind'] }) {
  const feeds = useStore((s) => s.feeds).filter((f) => f.kind === kind);
  if (!feeds.length) return null;
  return (
    <ul className="s-list">
      {feeds.map((f) => <FeedRow key={f.id} feed={f} />)}
    </ul>
  );
}
