import { useStore } from '../store';
import type { Theme } from '../types';
import Icon from './Icon';
import './Settings.css';

const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: 'brightness_auto' },
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
];

export default function SettingsAppearance() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  return (
    <div className="s-stack">
      <div className="s-field">
        <span>Theme</span>
        <div className="s-segmented">
          {THEMES.map((t) => (
            <button key={t.value} type="button" aria-pressed={settings.theme === t.value} onClick={() => updateSettings({ theme: t.value })}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="s-field">
        <span>Week starts on</span>
        <div className="s-segmented">
          {(['Sunday', 'Monday'] as const).map((label, i) => (
            <button key={label} type="button" aria-pressed={settings.weekStartsOn === i} onClick={() => updateSettings({ weekStartsOn: i as 0 | 1 })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="s-switch-row">
        <div className="s-switch-row__text">
          <div className="s-switch-row__title">Hide completed assignments</div>
          <div className="s-switch-row__sub">Checked-off assignments disappear from the calendar grid but stay in “Due soon”.</div>
        </div>
        <button
          type="button"
          role="switch"
          className="s-switch"
          aria-checked={settings.hideCompleted}
          aria-label="Hide completed assignments"
          onClick={() => updateSettings({ hideCompleted: !settings.hideCompleted })}
        />
      </label>
    </div>
  );
}
