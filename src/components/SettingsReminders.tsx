import { useState } from 'react';
import { useStore } from '../store';
import { REMINDER_OFFSETS, notificationsSupported } from '../features/reminders';
import Icon from './Icon';
import './Settings.css';

export default function SettingsReminders() {
  const enabled = useStore((s) => s.settings.remindersEnabled);
  const offsets = useStore((s) => s.settings.reminderOffsetsMin);
  const updateSettings = useStore((s) => s.updateSettings);
  const supported = notificationsSupported();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  );

  const toggle = async () => {
    if (enabled) return updateSettings({ remindersEnabled: false });
    if (!supported) return;
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') updateSettings({ remindersEnabled: true });
  };

  const toggleOffset = (min: number) => {
    const next = offsets.includes(min) ? offsets.filter((o) => o !== min) : [...offsets, min].sort((a, b) => b - a);
    updateSettings({ reminderOffsetsMin: next });
  };

  return (
    <div className="s-stack">
      <label className="s-switch-row">
        <div className="s-switch-row__text">
          <div className="s-switch-row__title">Assignment reminders</div>
          <div className="s-switch-row__sub">Get a notification before Canvas assignments are due.</div>
        </div>
        <button
          type="button"
          role="switch"
          className="s-switch"
          aria-checked={enabled}
          aria-label="Assignment reminders"
          disabled={!supported}
          onClick={toggle}
        />
      </label>

      {permission === 'unsupported' && (
        <p className="s-msg s-msg--warn">
          <Icon name="warning" /> This browser doesn’t support notifications. On iPhone/iPad, add the app to your
          Home Screen first (Share → Add to Home Screen), then open it from there.
        </p>
      )}
      {permission === 'denied' && (
        <p className="s-msg s-msg--error">
          <Icon name="notifications_off" /> Notifications are blocked for this site. Allow them in your browser’s site
          settings (the icon next to the address bar), then turn reminders on again.
        </p>
      )}

      <div>
        <div className="s-field" style={{ marginBottom: 8 }}><span>Remind me before the due time</span></div>
        <div className="s-chips">
          {REMINDER_OFFSETS.map((o) => {
            const on = offsets.includes(o.min);
            return (
              <button key={o.min} type="button" className="s-chip" aria-pressed={on} disabled={!enabled} onClick={() => toggleOffset(o.min)}>
                {on && <Icon name="check" />}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="s-note">
        <Icon name="info" />
        <span>
          Reminders fire while the app is open in a tab or installed as an app. Checked-off assignments don’t remind you.
        </span>
      </div>
    </div>
  );
}
