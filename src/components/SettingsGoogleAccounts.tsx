import { useState } from 'react';
import { useStore, sourceKeyFor } from '../store';
import { connectGoogleAccount, disconnectGoogleAccount } from '../sources/google';
import { syncAll, syncSource } from '../sources/sync';
import { GOOGLE_CLIENT_ID, WORKER_URL } from '../config';
import type { GoogleAccount } from '../types';
import Icon from './Icon';
import SettingsSyncStatus from './SettingsSyncStatus';
import './Settings.css';

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/popup.*(closed|blocked)|closed.*popup/i.test(msg)) return 'The Google sign-in window was closed before finishing. Try again.';
  return msg || 'Something went wrong connecting to Google.';
}

function Avatar({ account }: { account: GoogleAccount }) {
  const [broken, setBroken] = useState(false);
  if (account.picture && !broken) {
    return <img className="s-avatar" src={account.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return <span className="s-avatar" aria-hidden="true">{(account.name || account.email).charAt(0).toUpperCase()}</span>;
}

/** Connected Google accounts with add / reconnect / remove. Used by Settings and Onboarding. */
export default function SettingsGoogleAccounts({ compact = false }: { compact?: boolean }) {
  const accounts = useStore((s) => s.accounts);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = Boolean(GOOGLE_CLIENT_ID && WORKER_URL);

  // connectGoogleAccount opens a popup, so it must run synchronously inside the click handler.
  const connect = (loginHint?: string) => {
    setError(null);
    setBusy(loginHint ?? 'new');
    connectGoogleAccount(loginHint)
      .then(() => syncAll())
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(null));
  };

  const remove = async (account: GoogleAccount) => {
    setError(null);
    setBusy(account.id);
    try {
      await disconnectGoogleAccount(account.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="s-stack">
      <ul className="s-list">
        {accounts.map((a) => (
          <li className="s-item" key={a.id}>
            <Avatar account={a} />
            <div className="s-item__main">
              <div className="s-item__title">{a.name || a.email}</div>
              <div className="s-item__sub">
                {a.name ? `${a.email} · ` : ''}
                {a.needsReconnect ? (
                  <span className="s-status s-status--warn">Signed out – reconnect to keep syncing</span>
                ) : (
                  <SettingsSyncStatus sourceKey={sourceKeyFor.google(a.id)} />
                )}
              </div>
            </div>
            <div className="s-item__actions">
              {a.needsReconnect ? (
                <button className="s-btn s-btn--tonal s-btn--small" disabled={busy !== null} onClick={() => connect(a.email)}>
                  Reconnect
                </button>
              ) : (
                <button
                  className="s-icon-btn s-icon-btn--small"
                  title="Sync now"
                  aria-label={`Sync ${a.email} now`}
                  onClick={() => void syncSource(sourceKeyFor.google(a.id))}
                >
                  <Icon name="sync" />
                </button>
              )}
              <button
                className="s-icon-btn"
                title={`Remove ${a.email}`}
                aria-label={`Remove ${a.email}`}
                disabled={busy !== null}
                onClick={() => remove(a)}
              >
                <Icon name="logout" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div>
        <button
          className={`s-btn ${accounts.length ? 's-btn--outlined' : 's-btn--filled'}`}
          disabled={busy !== null}
          onClick={() => connect()}
        >
          {busy === 'new' ? <span className="s-spinner" aria-hidden="true" /> : <Icon name="add" />}
          {accounts.length ? 'Add another Google account' : 'Connect Google account'}
        </button>
        {error && (
          <p className="s-msg s-msg--error" role="alert">
            <Icon name="error" /> {error}
          </p>
        )}
        {!configured && (
          <p className="s-msg s-msg--warn">
            <Icon name="warning" /> Google sign-in isn’t configured on this copy of the site yet (missing client ID or Worker URL).
          </p>
        )}
      </div>

      {!compact && (
        <div className="s-note">
          <Icon name="info" />
          <span>
            Access is read-only. While this app is in Google’s “testing” mode, only accounts the site owner has
            approved as test users can sign in, and you may need to reconnect about once a week.
          </span>
        </div>
      )}
    </div>
  );
}
