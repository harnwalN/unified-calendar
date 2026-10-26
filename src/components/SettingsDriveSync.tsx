import { useState } from 'react';
import { formatDistanceStrict } from 'date-fns';
import { useStore } from '../store';
import { connectGoogleAccount, DRIVE_APPDATA_SCOPE, hasGrantedScope } from '../sources/google';
import { syncDriveNow, useDriveSyncStatus } from '../sources/driveSync';
import { useNow } from '../features/useNow';
import type { GoogleAccount } from '../types';
import Icon from './Icon';
import './Settings.css';
import './SettingsSync.css';

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg || 'Something went wrong turning on sync.';
}

function StatusLine() {
  const status = useDriveSyncStatus();
  const now = useNow();
  if (status.state === 'syncing') {
    return (
      <span className="s-status" role="status">
        <span className="s-spinner" aria-hidden="true" /> Syncing…
      </span>
    );
  }
  if (status.state === 'error') {
    return <span className="s-status s-status--error" role="alert">{status.error || 'Sync failed'}</span>;
  }
  if (status.lastSynced) {
    const ago = now.getTime() - status.lastSynced < 60_000 ? 'just now' : `${formatDistanceStrict(status.lastSynced, now)} ago`;
    return <span className="s-status"><Icon name="cloud_done" /> Synced {ago}</span>;
  }
  return <span className="s-status">Waiting to sync…</span>;
}

/** Settings → Sync: pick the Google account whose Drive app-data folder stores tasks, plans and time. */
export default function SettingsDriveSync() {
  const accounts = useStore((s) => s.accounts);
  const syncAccountId = useStore((s) => s.settings.syncAccountId);
  const updateSettings = useStore((s) => s.updateSettings);
  const status = useDriveSyncStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = accounts.find((a) => a.id === syncAccountId);

  // Consent opens a popup, so it must start synchronously inside the click/change handler.
  const grant = (account: GoogleAccount) => {
    setBusy(account.id);
    connectGoogleAccount(account.email, [DRIVE_APPDATA_SCOPE])
      .then((granted) => {
        if (granted.id !== account.id) throw new Error(`You signed in as ${granted.email}. Pick that account here to sync with it.`);
        updateSettings({ syncAccountId: granted.id });
        return syncDriveNow();
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(null));
  };

  const choose = (account: GoogleAccount | null) => {
    setError(null);
    if (!account) return updateSettings({ syncAccountId: undefined });
    if (account.id === syncAccountId) return;
    if (hasGrantedScope(account.id, DRIVE_APPDATA_SCOPE)) updateSettings({ syncAccountId: account.id });
    else grant(account);
  };

  return (
    <div className="s-stack">
      <div className="s-note">
        <Icon name="cloud_sync" />
        <span>
          Your tasks, plans, notes and time logs are saved to a hidden app folder in your Google Drive, so they follow you
          to every device where you turn this on with the same account. The app can only see its own file there — not
          your other Drive files. Accounts, feed links and sign-in tokens never leave this device.
        </span>
      </div>

      {accounts.length === 0 ? (
        <p className="s-msg"><Icon name="info" /> Connect a Google account above to turn on sync.</p>
      ) : (
        <div className="s-field">
          <span id="sync-account-label">Sync with</span>
          <ul className="s-list sync-choices" role="radiogroup" aria-labelledby="sync-account-label">
            {[null, ...accounts].map((a) => {
              const checked = (a?.id ?? undefined) === (current?.id ?? undefined);
              return (
                <li key={a?.id ?? 'off'} className="s-item sync-choice">
                  <label>
                    <input
                      type="radio"
                      name="sync-account"
                      checked={checked}
                      disabled={busy !== null}
                      onChange={() => choose(a)}
                    />
                    <span className="s-item__main">
                      <span className="s-item__title">{a ? a.email : 'Off'}</span>
                      <span className="s-item__sub">
                        {a ? (a.needsReconnect ? 'Signed out – reconnect it first' : 'Google Drive (hidden app folder)') : 'Keep everything on this device only'}
                      </span>
                    </span>
                    {busy === a?.id && <span className="s-spinner" aria-label="Waiting for Google" />}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {current && (
        <div className="sync-status-row">
          <StatusLine />
          <div className="sync-status-row__actions">
            {status.needsConsent && (
              <button type="button" className="s-btn s-btn--tonal s-btn--small" disabled={busy !== null} onClick={() => grant(current)}>
                Grant Drive access
              </button>
            )}
            <button
              type="button"
              className="s-btn s-btn--outlined s-btn--small"
              disabled={status.state === 'syncing' || busy !== null}
              onClick={() => void syncDriveNow()}
            >
              <Icon name="sync" /> Sync now
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="s-msg s-msg--error" role="alert">
          <Icon name="error" /> {error}
        </p>
      )}
    </div>
  );
}
