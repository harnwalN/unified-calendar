// Lighting helpers shared by every scene: land colors shift with the sky and objects cast
// flat ground shadows away from the sun.
import { mixHex, type SkyPalette } from '../../lib/sun';
import type { SkyState } from './sky';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const NIGHT = '#0d1330';
const NIGHT_HAZE = '#56679f';
const WARM = '#ff9a5c';

/** Scene canvas: 1200×200 user units, anchored bottom-centre (xMidYMax slice). */
export const VIEW_W = 1200;
export const VIEW_H = 200;

export interface Paint {
  pal: SkyPalette;
  /** Land color for a daylight base color at a depth (0 = foreground … 1 = horizon). */
  c: (hex: string, depth?: number) => string;
  /** Two-tone face of an object: `lit` faces toward the sun. */
  face: (hex: string, depth: number, lit: boolean) => string;
  /** True when the sun (or its glow) is left of x. */
  sunLeftOf: (x: number) => boolean;
  /** Ground shadow polygon for an object of width w, height h standing at (x, gy); null when no shadow. */
  shadow: (x: number, gy: number, w: number, h: number, box?: boolean) => string | null;
  shadowOpacity: number;
  sunX: number;
  /** 0 by day … 1 deep night (window lights, lighthouse beam). */
  night: number;
}

export function makePaint(sky: SkyState, sunX: number): Paint {
  const { palette: pal, altitude, sunFrac } = sky;
  const dark = 1 - pal.ambient;
  const haze = mixHex(pal.skyLow, NIGHT_HAZE, dark * 0.7);
  const contrast = 0.1 + pal.shadowOpacity * 0.5;

  const c = (hex: string, depth = 0) => {
    let col = mixHex(hex, haze, depth * 0.55);
    col = mixHex(col, WARM, pal.warm * 0.2 * (1 - depth * 0.4));
    return mixHex(col, NIGHT, dark * (0.7 - depth * 0.3));
  };

  // Shadow direction rotates with the sun: to the right at sunrise, towards the viewer at noon.
  const p = clamp(sunFrac, 0, 1);
  const len = clamp(1 / Math.tan((Math.max(altitude, 0.5) * Math.PI) / 180), 0.18, 3.2);
  const dx = Math.cos(Math.PI * p) * len;
  const dy = Math.sin(Math.PI * p) * 0.22 * len + 0.04;
  const casting = pal.shadowOpacity > 0.01;

  return {
    pal,
    c,
    face: (hex, depth, lit) => {
      const base = c(hex, depth);
      return lit ? mixHex(base, mixHex('#ffffff', pal.sun, pal.warm), contrast * 0.7) : mixHex(base, NIGHT, contrast);
    },
    sunLeftOf: (x) => sunX < x,
    shadow: (x, gy, w, h, box) => {
      if (!casting) return null;
      const sx = dx * h;
      const sy = dy * h;
      const l = x - w / 2;
      const r = x + w / 2;
      if (box) return `${l},${gy} ${r},${gy} ${r + sx},${gy + sy} ${l + sx},${gy + sy}`;
      return `${l},${gy} ${r},${gy} ${x + sx + w * 0.15},${gy + sy} ${x + sx - w * 0.15},${gy + sy}`;
    },
    shadowOpacity: pal.shadowOpacity,
    sunX,
    night: clamp((-altitude + 1) / 9, 0, 1),
  };
}

/** Deterministic PRNG so stars, windows and tree rows never jump between renders. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ridge {
  /** Filled path from the ridge line down to the bottom edge. */
  d: string;
  y: (x: number) => number;
}

/** Smooth-ish faceted ridge: base + Σ amp·sin(2πx/period + phase). */
export function ridge(base: number, terms: [amp: number, period: number, phase: number][], step = 24): Ridge {
  const y = (x: number) => terms.reduce((s, [a, per, ph]) => s + a * Math.sin((2 * Math.PI * x) / per + ph), base);
  let d = `M-40 ${VIEW_H}`;
  for (let x = -40; x <= VIEW_W + 40; x += step) d += ` L${x} ${y(x).toFixed(1)}`;
  return { d: `${d} L${VIEW_W + 40} ${VIEW_H} Z`, y };
}

/** A row of simple triangle pines standing on `ground`, as one silhouette path. */
export function pineRow(ground: (x: number) => number, spacing: number, hMin: number, hMax: number, seed: number): string {
  const r = rng(seed);
  let d = '';
  for (let x = -20; x < VIEW_W + 20; x += spacing * (0.6 + r() * 0.8)) {
    const h = hMin + r() * (hMax - hMin);
    const w = h * 0.42;
    const gy = ground(x) + 3;
    d += `M${(x - w / 2).toFixed(1)} ${gy.toFixed(1)} L${x.toFixed(1)} ${(gy - h).toFixed(1)} L${(x + w / 2).toFixed(1)} ${gy.toFixed(1)}Z`;
  }
  return d;
}
