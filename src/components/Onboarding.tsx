import { useState } from 'react';
import { useStore } from '../store';
import Icon from './Icon';
import SettingsGoogleAccounts from './SettingsGoogleAccounts';
import SettingsCanvasForm from './SettingsCanvasForm';
import SettingsFeedList from './SettingsFeedList';
import './Settings.css';
import './Onboarding.css';

const STEPS = ['google', 'canvas', 'done'] as const;

function OnboardingDone() {
  const accounts = useStore((s) => s.accounts.length);
  const feeds = useStore((s) => s.feeds.length);
  const tips = [
    { icon: 'checklist', text: 'Check off assignments in “Due soon” as you finish them.' },
    { icon: 'notifications', text: 'Turn on reminders in Settings to get notified before deadlines.' },
    { icon: 'install_mobile', text: 'Install it: “Add to Home Screen” on your phone, or the install icon in your browser’s address bar.' },
  ];
  return (
    <>
      <div className="onb__summary">
        <span className="onb__pill"><Icon name="account_circle" /> {accounts} Google {accounts === 1 ? 'account' : 'accounts'}</span>
        <span className="onb__pill"><Icon name="event_note" /> {feeds} {feeds === 1 ? 'feed' : 'feeds'}</span>
      </div>
      <ul className="onb__tips">
        {tips.map((t) => (
          <li key={t.icon}><Icon name={t.icon} /> <span>{t.text}</span></li>
        ))}
      </ul>
      <p className="onb__hint">You can add or remove calendars any time from <b>Settings</b>.</p>
    </>
  );
}

/** First-run welcome flow, shown while `!onboarded`. */
export default function Onboarding() {
  const setOnboarded = useStore((s) => s.setOnboarded);
  const [step, setStep] = useState(0);
  const finish = () => setOnboarded(true);

  const content = {
    google: {
      icon: 'calendar_month',
      title: 'Welcome to Unified Calendar',
      text: 'All your Google calendars, Canvas deadlines and other calendars in one place. Start by connecting your Google accounts – add as many as you like.',
      body: <SettingsGoogleAccounts compact />,
    },
    canvas: {
      icon: 'school',
      title: 'Add your Canvas assignments',
      text: 'Canvas gives every student a private calendar feed link. Here’s how to find it:',
      body: <div className="s-stack"><SettingsFeedList kind="canvas" /><SettingsCanvasForm /></div>,
    },
    done: {
      icon: 'celebration',
      title: 'You’re all set!',
      text: 'Your calendars sync automatically and are saved in this browser.',
      body: <OnboardingDone />,
    },
  }[STEPS[step]];

  const last = step === STEPS.length - 1;

  return (
    <div className="onb-scrim">
      <div className="onb" role="dialog" aria-modal="true" aria-labelledby="onb-title">
        <div className="onb__top">
          <div className="onb__dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className="onb__dot" data-state={i === step ? 'current' : i < step ? 'done' : 'todo'} />
            ))}
          </div>
          {!last && (
            <button className="s-btn s-btn--small onb__skip" onClick={finish}>Skip for now</button>
          )}
        </div>

        <div className="onb__scroll" key={step}>
          <div className="onb__hero" aria-hidden="true"><Icon name={content.icon} size={32} /></div>
          <h1 id="onb-title" className="onb__title">{content.title}</h1>
          <p className="onb__text">{content.text}</p>
          <div className="onb__body">{content.body}</div>
        </div>

        <div className="onb__actions">
          {step > 0 ? (
            <button className="s-btn" onClick={() => setStep(step - 1)}><Icon name="arrow_back" /> Back</button>
          ) : <span />}
          {last ? (
            <button className="s-btn s-btn--filled" onClick={finish}>Open my calendar</button>
          ) : (
            <button className="s-btn s-btn--filled" onClick={() => setStep(step + 1)}>
              Next <Icon name="arrow_forward" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
