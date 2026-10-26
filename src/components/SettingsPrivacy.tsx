import { useState } from 'react';
import { resetApp } from '../features/resetApp';
import Icon from './Icon';
import './Settings.css';

export default function SettingsPrivacy() {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  return (
    <div className="s-stack">
      <div className="s-note">
        <Icon name="shield_lock" />
        <span>
          <b>Your data stays in this browser.</b> Your settings, feed links and cached events are stored only on this
          device. Calendar data goes straight from Google, Canvas and your feeds to this page – there is no app database,
          no analytics and no ads. Google sign-in passes through a tiny helper server only to issue tokens; nothing is
          stored there.{' '}
          <a className="s-link" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">
            Read the privacy policy
          </a>
        </span>
      </div>

      {!confirming ? (
        <div>
          <button type="button" className="s-btn s-btn--outlined s-btn--danger" onClick={() => setConfirming(true)}>
            <Icon name="restart_alt" /> Reset app
          </button>
        </div>
      ) : (
        <div className="s-confirm" role="alertdialog" aria-label="Confirm reset">
          <p>
            This signs out every Google account, removes all feeds and settings, and deletes cached events from this
            browser. It can’t be undone.
          </p>
          <div className="s-confirm__actions">
            <button type="button" className="s-btn" disabled={resetting} onClick={() => setConfirming(false)}>Cancel</button>
            <button
              type="button"
              className="s-btn s-btn--filled s-btn--danger"
              disabled={resetting}
              onClick={() => {
                setResetting(true);
                void resetApp();
              }}
            >
              {resetting ? <span className="s-spinner" aria-hidden="true" /> : <Icon name="delete_forever" />}
              Reset everything
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
