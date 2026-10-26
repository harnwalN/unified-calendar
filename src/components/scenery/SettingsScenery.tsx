import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';
import type { SceneId } from '../../types';
import Icon from '../Icon';
import SceneArt from './SceneArt';
import { SCENE_IDS, SCENES } from './scenes';
import { skyState, useSceneClock, useSunLocation } from './sky';
import '../Settings.css';
import './Scenery.css';

type LocState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string };

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Settings → Appearance: pick the header scene and (optionally) a precise location. */
export default function SettingsScenery() {
  const scene = useStore((s) => s.settings.scene);
  const updateSettings = useStore((s) => s.updateSettings);
  const now = useSceneClock();
  const { loc, estimated } = useSunLocation();
  const sky = useMemo(() => skyState(now, loc), [now, loc]);
  const [locState, setLocState] = useState<LocState>({ kind: 'idle' });

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocState({ kind: 'error', message: 'Location isn’t available in this browser.' });
      return;
    }
    setLocState({ kind: 'busy' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        updateSettings({ sunLocation: { lat: round2(coords.latitude), lon: round2(coords.longitude) } });
        setLocState({ kind: 'idle' });
      },
      (err) =>
        setLocState({
          kind: 'error',
          message: err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Couldn’t get your location. Try again.',
        }),
      { maximumAge: 3_600_000, timeout: 15_000 },
    );
  };

  const { sunrise, sunset, polar } = sky.times;
  const fmt = (d: Date) => format(d, 'p');

  return (
    <div className="s-stack">
      <div className="s-field">
        <span id="scene-label">Header scene</span>
        <div className="sc-picker" role="radiogroup" aria-labelledby="scene-label">
          {SCENE_IDS.map((id: SceneId) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={scene === id}
              className="sc-thumb"
              onClick={() => updateSettings({ scene: id })}
            >
              <span className="sc-thumb__art">
                <SceneArt scene={id} sky={sky} />
                {scene === id && <Icon name="check_circle" className="sc-thumb__check" />}
              </span>
              <span className="sc-thumb__label">{SCENES[id].label}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={scene === 'off'} className="sc-thumb" onClick={() => updateSettings({ scene: 'off' })}>
            <span className="sc-thumb__art sc-thumb__art--off">
              <Icon name="hide_image" />
              {scene === 'off' && <Icon name="check_circle" className="sc-thumb__check" />}
            </span>
            <span className="sc-thumb__label">Off</span>
          </button>
        </div>
      </div>

      <div className="s-field">
        <span>Sunrise &amp; sunset</span>
        <div className="sc-times">
          {polar ? (
            <span className="sc-times__item">
              <Icon name={polar === 'day' ? 'light_mode' : 'dark_mode'} />
              {polar === 'day' ? 'The sun doesn’t set today' : 'The sun doesn’t rise today'}
            </span>
          ) : (
            <>
              <span className="sc-times__item"><Icon name="wb_twilight" /> Sunrise {sunrise && fmt(sunrise)}</span>
              <span className="sc-times__item"><Icon name="routine" /> Sunset {sunset && fmt(sunset)}</span>
            </>
          )}
        </div>
        <p className="s-msg">
          <Icon name={estimated ? 'schedule' : 'location_on'} />
          <span>
            {estimated
              ? 'Using an estimate from your time zone. Share your location for accurate times.'
              : `Using your location (${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}).`}
          </span>
        </p>
        <div className="s-row">
          {estimated ? (
            <button type="button" className="s-btn s-btn--tonal" onClick={locate} disabled={locState.kind === 'busy'}>
              <Icon name={locState.kind === 'busy' ? 'progress_activity' : 'my_location'} className={locState.kind === 'busy' ? 'spin' : undefined} />
              Use my location
            </button>
          ) : (
            <button type="button" className="s-btn" onClick={() => updateSettings({ sunLocation: undefined })}>
              <Icon name="restart_alt" /> Use time-zone estimate
            </button>
          )}
        </div>
        {locState.kind === 'error' && (
          <p className="s-msg s-msg--error" role="alert">
            <Icon name="error" /> {locState.message}
          </p>
        )}
      </div>
    </div>
  );
}
