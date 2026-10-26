import { describe, expect, it } from 'vitest';
import {
  estimateLocationFromOffsets,
  luminance,
  mixHex,
  moonPhase,
  skyPalette,
  skyPhase,
  sunPosition,
  sunTimes,
} from './sun';

const SD = { lat: 32.72, lon: -117.16 };
const minutesApart = (a: Date | null, b: Date) => Math.abs((a?.getTime() ?? NaN) - b.getTime()) / 60_000;

describe('sunTimes', () => {
  // San Diego, 2026-06-21 (PDT = UTC-7). Noon local is 19:00 UTC.
  const t = sunTimes(new Date('2026-06-21T19:00:00Z'), SD.lat, SD.lon);

  it('matches published sunrise/sunset for San Diego on the solstice', () => {
    expect(t.polar).toBeNull();
    expect(minutesApart(t.sunrise, new Date('2026-06-21T12:42:00Z'))).toBeLessThan(5); // 05:42 PDT
    expect(minutesApart(t.sunset, new Date('2026-06-22T03:00:00Z'))).toBeLessThan(5); // 20:00 PDT
    expect(minutesApart(t.solarNoon, new Date('2026-06-21T19:51:00Z'))).toBeLessThan(3);
  });

  it('picks the solar day nearest the given instant', () => {
    const late = sunTimes(new Date('2026-06-22T06:00:00Z'), SD.lat, SD.lon); // 23:00 PDT on the 21st
    expect(minutesApart(late.sunrise, t.sunrise!)).toBeLessThan(1);
    const early = sunTimes(new Date('2026-06-21T08:00:00Z'), SD.lat, SD.lon); // 01:00 PDT on the 21st
    expect(minutesApart(early.sunrise, t.sunrise!)).toBeLessThan(1);
  });

  it('handles polar day and polar night without throwing', () => {
    const tromsoSummer = sunTimes(new Date('2026-06-21T12:00:00Z'), 69.65, 18.96);
    expect(tromsoSummer.polar).toBe('day');
    expect(tromsoSummer.sunrise).toBeNull();
    const tromsoWinter = sunTimes(new Date('2026-12-21T12:00:00Z'), 69.65, 18.96);
    expect(tromsoWinter.polar).toBe('night');
    expect(tromsoWinter.sunset).toBeNull();
    expect(() => sunTimes(new Date('2026-03-20T12:00:00Z'), 90, 0)).not.toThrow();
    expect(() => sunTimes(new Date('2026-03-20T12:00:00Z'), -90, 0)).not.toThrow();
  });
});

describe('sunPosition', () => {
  it('reaches ≈80.7° at solar noon in San Diego on the solstice', () => {
    const { solarNoon } = sunTimes(new Date('2026-06-21T19:00:00Z'), SD.lat, SD.lon);
    const p = sunPosition(solarNoon, SD.lat, SD.lon);
    expect(p.altitudeDeg).toBeGreaterThan(80.4);
    expect(p.altitudeDeg).toBeLessThan(81);
    expect(Math.abs(p.azimuthDeg - 180)).toBeLessThan(3);
  });

  it('is east in the morning, west in the evening and below the horizon at night', () => {
    const morning = sunPosition(new Date('2026-06-21T15:00:00Z'), SD.lat, SD.lon);
    expect(morning.azimuthDeg).toBeGreaterThan(45);
    expect(morning.azimuthDeg).toBeLessThan(135);
    const evening = sunPosition(new Date('2026-06-22T01:00:00Z'), SD.lat, SD.lon);
    expect(evening.azimuthDeg).toBeGreaterThan(225);
    expect(evening.azimuthDeg).toBeLessThan(315);
    expect(sunPosition(new Date('2026-06-22T07:00:00Z'), SD.lat, SD.lon).altitudeDeg).toBeLessThan(-20);
  });

  it('is near 0° altitude at sunrise', () => {
    const { sunrise } = sunTimes(new Date('2026-06-21T19:00:00Z'), SD.lat, SD.lon);
    expect(Math.abs(sunPosition(sunrise!, SD.lat, SD.lon).altitudeDeg)).toBeLessThan(0.6);
  });

  it('does not throw at the poles', () => {
    expect(Number.isFinite(sunPosition(new Date('2026-06-21T12:00:00Z'), 90, 0).altitudeDeg)).toBe(true);
  });
});

describe('estimateLocationFromOffsets', () => {
  it('uses the standard-time offset and guesses the hemisphere from DST', () => {
    expect(estimateLocationFromOffsets(480, 420)).toEqual({ lat: 35, lon: -120 }); // Los Angeles
    expect(estimateLocationFromOffsets(-600, -660).lon).toBe(150); // Sydney (DST in January)
    expect(estimateLocationFromOffsets(-660, -600).lat).toBe(-35);
    expect(estimateLocationFromOffsets(-330, -330)).toEqual({ lat: 35, lon: 82.5 }); // India, no DST
    expect(estimateLocationFromOffsets(0, 0)).toEqual({ lat: 35, lon: 0 });
  });
});

describe('palette', () => {
  it('maps altitude to phases', () => {
    expect(skyPhase(-20)).toBe('night');
    expect(skyPhase(-3)).toBe('twilight');
    expect(skyPhase(5)).toBe('golden');
    expect(skyPhase(45)).toBe('day');
  });

  it('is dark with stars at night and shadowless; lit with shadows by day', () => {
    const night = skyPalette(-30, false);
    expect(night.starOpacity).toBe(1);
    expect(night.shadowOpacity).toBe(0);
    expect(luminance(night.skyTop)).toBeLessThan(0.02);
    const day = skyPalette(50, true);
    expect(day.ambient).toBe(1);
    expect(day.shadowOpacity).toBeGreaterThan(0.1);
    expect(day.starOpacity).toBe(0);
  });

  it('tints sunrise pinker and sunset more orange', () => {
    const am = skyPalette(0, true).skyLow;
    const pm = skyPalette(0, false).skyLow;
    expect(am).not.toBe(pm);
  });

  it('mixes hex colors', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#ffffff', 0)).toBe('#102030');
  });
});

describe('moonPhase', () => {
  it('knows a recent full moon', () => {
    // Full moon on 2026-10-26 ≈ 04:12 UTC.
    expect(Math.abs(moonPhase(new Date('2026-10-26T04:12:00Z')) - 0.5)).toBeLessThan(0.04);
  });
});
