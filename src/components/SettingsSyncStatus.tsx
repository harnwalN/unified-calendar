import { formatDistanceStrict } from 'date-fns';
import { useStore } from '../store';
import { useNow } from '../features/useNow';
import './Settings.css';

/** "Synced 3 min ago" / spinner / error text for one source key. */
export default function SettingsSyncStatus({ sourceKey }: { sourceKey: string }) {
  const status = useStore((s) => s.syncStatus[sourceKey]);
  const now = useNow();

  if (status?.state === 'loading') {
    return (
      <span className="s-status" role="status">
        <span className="s-spinner" aria-hidden="true" /> Syncing…
      </span>
    );
  }
  if (status?.state === 'error') {
    return (
      <span className="s-status s-status--error" title={status.error}>
        {status.error || 'Sync failed'}
      </span>
    );
  }
  if (status?.lastSync) {
    const ago = now.getTime() - status.lastSync < 60_000 ? 'just now' : `${formatDistanceStrict(status.lastSync, now)} ago`;
    return <span className="s-status">Synced {ago}</span>;
  }
  return <span className="s-status">Not synced yet</span>;
}
