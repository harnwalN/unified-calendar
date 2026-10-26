// Solar position + sunrise/sunset (NOAA spreadsheet algorithm) and the sky palette that the
// scenery banner derives from the sun's altitude. Pure, no dependencies.

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SunPosition {
  /** Degrees above the horizon (negative = below), including a simple refraction correction. */
  altitudeDeg: number;
  /** Degrees clockwise from north. */
  azimuthDeg: number;
}

export interface SunTimes {
  /** null during polar day/night. */
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  polar: 'day' | 'night' | null;
}

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Declination (deg) and equation of time (minutes) at an instant. */
function solarParams(ms: number) {
  const jc = (ms / DAY_MS + 2440587.5 - 2451545) / 36525;
  const l0 = (((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const c =
    Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) / RAD;
  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const eqTime =
    4 /
    RAD *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  return { decl, eqTime };
}

export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
  const ms = date.getTime();
  const { decl, eqTime } = solarParams(ms);
  const utcMin = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 60_000;
  const trueSolar = (((utcMin + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = trueSolar / 4 - 180;
  const cosZen = clamp(
    Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(hourAngle * RAD),
    -1,
    1,
  );
  const zenith = Math.acos(cosZen) / RAD;
  const elev = 90 - zenith;

  // Atmospheric refraction (NOAA approximation), in degrees.
  let refr = 0;
  if (elev <= 85) {
    const te = Math.tan(elev * RAD);
    if (elev > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elev > -0.575) refr = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
    else refr = -20.772 / te;
    refr /= 3600;
  }

  const denom = Math.cos(lat * RAD) * Math.sin(zenith * RAD);
  let azimuth: number;
  if (Math.abs(denom) < 1e-9) azimuth = lat > 0 ? 180 : 0;
  else {
    const a = Math.acos(clamp((Math.sin(lat * RAD) * Math.cos(zenith * RAD) - Math.sin(decl * RAD)) / denom, -1, 1)) / RAD;
    azimuth = hourAngle > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  return { altitudeDeg: elev + refr, azimuthDeg: azimuth };
}

/**
 * Sunrise, solar noon and sunset for the solar day whose noon is nearest `date`
 * (for a location in its own time zone, that is the local calendar day).
 */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const ms = date.getTime();
  const noonAt = (dayStartUtc: number) => {
    // Two passes: the equation of time is evaluated at the approximate noon itself.
    let noon = dayStartUtc + (720 - 4 * lon) * 60_000;
    for (let i = 0; i < 2; i++) noon = dayStartUtc + (720 - 4 * lon - solarParams(noon).eqTime) * 60_000;
    return noon;
  };
  let dayStart = Math.floor(ms / DAY_MS) * DAY_MS;
  let noon = noonAt(dayStart);
  while (noon - ms > DAY_MS / 2) noon = noonAt((dayStart -= DAY_MS));
  while (ms - noon > DAY_MS / 2) noon = noonAt((dayStart += DAY_MS));

  // Half-day length from the hour angle at which the sun's centre is 0.833° below the horizon.
  const hourAngle = (at: number) => {
    const { decl } = solarParams(at);
    return (
      (Math.cos(90.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.cos(decl * RAD))
    );
  };
  const solarNoon = new Date(noon);
  const cosH = hourAngle(noon);
  if (!(cosH <= 1)) return { sunrise: null, sunset: null, solarNoon, polar: 'night' };
  if (cosH < -1) return { sunrise: null, sunset: null, solarNoon, polar: 'day' };

  const event = (sign: 1 | -1) => {
    // Refine with the declination at the event itself.
    let t = noon + (sign * 4 * Math.acos(cosH)) / RAD * 60_000;
    const h = hourAngle(t);
    if (h >= -1 && h <= 1) t = noon + (sign * 4 * Math.acos(h)) / RAD * 60_000;
    return new Date(t);
  };
  return { sunrise: event(-1), sunset: event(1), solarNoon, polar: null };
}

/** Rough location from UTC offsets in minutes (as `Date#getTimezoneOffset`) in January and July. */
export function estimateLocationFromOffsets(janOffsetMin: number, julOffsetMin: number): LatLon {
  // Standard time has the larger offset; DST in July means the northern hemisphere.
  const standard = Math.max(janOffsetMin, julOffsetMin);
  const lat = janOffsetMin < julOffsetMin ? -35 : 35;
  const lon = clamp(-standard / 4, -180, 180);
  return { lat, lon: Math.round(lon * 100) / 100 || 0 };
}

/** Location estimated from this device's time zone. */
export function estimateLocation(year = new Date().getFullYear()): LatLon {
  return estimateLocationFromOffsets(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
}

// ---------------------------------------------------------------------------
// Sky palette
// ---------------------------------------------------------------------------

export type SkyPhase = 'night' | 'twilight' | 'golden' | 'day';

export function skyPhase(altitudeDeg: number): SkyPhase {
  if (altitudeDeg < -6) return 'night';
  if (altitudeDeg < 0) return 'twilight';
  if (altitudeDeg < 10) return 'golden';
  return 'day';
}

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: Rgb): string {
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}

/** Linear blend of two hex colors (t = 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const k = clamp(t, 0, 1);
  return toHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}

/** WCAG relative luminance, 0..1. */
export function luminance(hex: string): number {
  const ch = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

const ALT_KEYS = [-18, -10, -4, 0, 4, 10, 25, 60];

function sampleIndex(alt: number): [number, number] {
  const a = clamp(alt, ALT_KEYS[0], ALT_KEYS[ALT_KEYS.length - 1]);
  let i = 0;
  while (i < ALT_KEYS.length - 2 && a > ALT_KEYS[i + 1]) i++;
  return [i, (a - ALT_KEYS[i]) / (ALT_KEYS[i + 1] - ALT_KEYS[i])];
}

function sampleColor(stops: string[], alt: number) {
  const [i, t] = sampleIndex(alt);
  return mixHex(stops[i], stops[i + 1], t);
}

function sampleNum(stops: number[], alt: number) {
  const [i, t] = sampleIndex(alt);
  return stops[i] + (stops[i + 1] - stops[i]) * t;
}

const SKY_TOP = ['#060a1c', '#111944', '#22336e', '#3a5ca8', '#4a7ed0', '#3f88e6', '#2f7fe0', '#2a78dc'];
const SKY_MID_AM = ['#0c1330', '#25306a', '#58599c', '#8f8cc8', '#8cb7e8', '#79b4f2', '#6ab0f5', '#62acf5'];
const SKY_MID_PM = ['#0c1330', '#2b2c66', '#6a5296', '#b088b8', '#9cb5e0', '#79b4f2', '#6ab0f5', '#62acf5'];
const SKY_LOW_AM = ['#141c3e', '#3a3f7c', '#c58bb4', '#ffb3a6', '#ffdcae', '#d2e7f7', '#c6e3fc', '#bfe0fc'];
const SKY_LOW_PM = ['#141c3e', '#46356f', '#d06e88', '#ff9660', '#ffc47a', '#dbe6ee', '#c6e3fc', '#bfe0fc'];
const SUN = ['#ff6a3d', '#ff6a3d', '#ff6a3d', '#ff7f45', '#ffa047', '#ffc84d', '#fdd663', '#fde293'];
//                       -18    -10   -4    0     4     10    25    60
const AMBIENT = [0.08, 0.14, 0.3, 0.55, 0.8, 0.95, 1, 1];
const WARM = [0, 0, 0.55, 1, 0.85, 0.35, 0, 0];
const SHADOW = [0, 0, 0, 0.06, 0.26, 0.3, 0.26, 0.22];
const STARS = [1, 0.85, 0.2, 0, 0, 0, 0, 0];

export interface SkyPalette {
  phase: SkyPhase;
  skyTop: string;
  skyMid: string;
  skyLow: string;
  sun: string;
  /** Horizon glow color for sunrise (pink) / sunset (orange). */
  glow: string;
  /** 0 (night) … 1 (full daylight): how lit the land is. */
  ambient: number;
  /** 0 … 1: strength of the warm golden-hour tint. */
  warm: number;
  shadowOpacity: number;
  starOpacity: number;
  /** True when the sky behind the overlay text is light enough for dark text. */
  lightSky: boolean;
}

/** Smooth palette for a sun altitude; `morning` picks pinker sunrise vs orange sunset tints. */
export function skyPalette(altitudeDeg: number, morning: boolean): SkyPalette {
  const alt = altitudeDeg;
  const skyMid = sampleColor(morning ? SKY_MID_AM : SKY_MID_PM, alt);
  const skyTop = sampleColor(SKY_TOP, alt);
  return {
    phase: skyPhase(alt),
    skyTop,
    skyMid,
    skyLow: sampleColor(morning ? SKY_LOW_AM : SKY_LOW_PM, alt),
    sun: sampleColor(SUN, alt),
    glow: morning ? '#ff9fb0' : '#ff8a3d',
    ambient: sampleNum(AMBIENT, alt),
    warm: sampleNum(WARM, alt),
    shadowOpacity: sampleNum(SHADOW, alt),
    starOpacity: sampleNum(STARS, alt),
    lightSky: luminance(mixHex(skyTop, skyMid, 0.5)) > 0.5,
  };
}

/** Moon phase 0..1 (0 = new, 0.5 = full) from the mean synodic month. */
export function moonPhase(date: Date): number {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNew) / DAY_MS;
  return (((days / synodic) % 1) + 1) % 1;
}
