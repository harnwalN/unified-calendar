import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import type { SceneId } from '../../types';
import { estimateLocation, moonPhase, skyPalette, sunPosition, sunTimes, type LatLon, type SkyPalette, type SunTimes } from '../../lib/sun';

const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface SkyState {
  altitude: number;
  /** Highest altitude the sun reaches today (scales the arc). */
  noonAltitude: number;
  /** 0 at sunrise … 1 at sunset (outside that range before/after). */
  sunFrac: number;
  /** 0 at sunset … 1 at the next sunrise; null during the day. */
  moonFrac: number | null;
  moonPhase: number;
  palette: SkyPalette;
  times: SunTimes;
}

export function skyState(now: Date, loc: LatLon): SkyState {
  const t = now.getTime();
  const times = sunTimes(now, loc.lat, loc.lon);
  const noon = times.solarNoon.getTime();
  const altitude = sunPosition(now, loc.lat, loc.lon).altitudeDeg;
  const noonAltitude = sunPosition(times.solarNoon, loc.lat, loc.lon).altitudeDeg;

  let sunFrac: number;
  let moonFrac: number | null = null;
  if (times.sunrise && times.sunset) {
    const rise = times.sunrise.getTime();
    const set = times.sunset.getTime();
    sunFrac = (t - rise) / (set - rise);
    if (t > set) {
      const next = sunTimes(new Date(t + DAY_MS), loc.lat, loc.lon).sunrise?.getTime() ?? set + DAY_MS / 2;
      moonFrac = (t - set) / (next - set);
    } else if (t < rise) {
      const prev = sunTimes(new Date(t - DAY_MS), loc.lat, loc.lon).sunset?.getTime() ?? rise - DAY_MS / 2;
      moonFrac = (t - prev) / (rise - prev);
    }
  } else {
    sunFrac = 0.5 + (t - noon) / DAY_MS;
    if (times.polar === 'night') moonFrac = ((((t - noon) / DAY_MS) % 1) + 1) % 1;
  }

  return {
    altitude,
    noonAltitude,
    sunFrac,
    moonFrac: moonFrac === null ? null : clamp(moonFrac, 0, 1),
    moonPhase: moonPhase(now),
    palette: skyPalette(altitude, t < noon),
    times,
  };
}

/** Dev-only `?scene-time=HH:MM` / `?scene=coast` preview overrides. */
function devOverrides(): { time?: [number, number]; scene?: SceneId | 'off' } {
  if (!import.meta.env.DEV || typeof location === 'undefined') return {};
  const q = new URLSearchParams(location.search);
  const m = /^(\d{1,2}):(\d{2})$/.exec(q.get('scene-time') ?? '');
  const scene = q.get('scene') as SceneId | 'off' | null;
  return { time: m ? [Number(m[1]), Number(m[2])] : undefined, scene: scene ?? undefined };
}

const overrides = devOverrides();

export function useSceneId(): SceneId | 'off' {
  const scene = useStore((s) => s.settings.scene);
  return overrides.scene ?? scene;
}

export function useSunLocation(): { loc: LatLon; estimated: boolean } {
  const stored = useStore((s) => s.settings.sunLocation);
  const [estimate] = useState(estimateLocation);
  return stored ? { loc: stored, estimated: false } : { loc: estimate, estimated: true };
}

/** Current time, refreshed on each minute boundary and when the tab becomes visible again. */
export function useSceneClock(): Date {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(currentTime());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(currentTime());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

function currentTime(): Date {
  const d = new Date();
  if (overrides.time) d.setHours(overrides.time[0], overrides.time[1], 0, 0);
  return d;
}
