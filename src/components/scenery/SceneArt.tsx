import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import type { SceneId } from '../../types';
import { mixHex } from '../../lib/sun';
import { makePaint, rng, VIEW_H, VIEW_W } from './paint';
import { SCENES } from './scenes';
import type { SkyState } from './sky';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const STARS = (() => {
  const r = rng(42);
  return Array.from({ length: 70 }, (_, i) => ({ x: r() * VIEW_W, y: r() * 150, r: 0.5 + r() * 0.9, g: i % 3 }));
})();

/** Drifting clouds: height in the sky (0 top … 1 horizon), size, and seconds to cross. */
const CLOUDS = [
  { y: 0.2, k: 1, dur: 190 },
  { y: 0.42, k: 0.7, dur: 260 },
  { y: 0.12, k: 0.55, dur: 320 },
  { y: 0.33, k: 0.85, dur: 230 },
];

/** A flat-bottomed geometric cloud centred on 0,0 (baseline at y=0). */
function Cloud() {
  return (
    <>
      <rect x={-44} y={-12} width={88} height={12} rx={6} />
      <circle cx={-18} cy={-12} r={14} />
      <circle cx={8} cy={-17} r={18} />
      <circle cx={29} cy={-9} r={10} />
    </>
  );
}

/** Size of the element in CSS px, tracked with a ResizeObserver (default when unmeasured). */
function useBoxSize(fallback: [number, number]) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize((s) => (Math.abs(s[0] - width) < 1 && Math.abs(s[1] - height) < 1 ? s : [width, height]));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Lit part of the moon for phase f (0 new … 0.5 full … 1 new), centred on 0,0. */
function moonPath(f: number, r: number) {
  const k = Math.cos(2 * Math.PI * f);
  const rx = Math.abs(k) * r;
  const waxing = f < 0.5;
  const outer = `M0 ${-r} A${r} ${r} 0 0 ${waxing ? 1 : 0} 0 ${r}`;
  const inner = `A${rx} ${r} 0 0 ${waxing === k > 0 ? 0 : 1} 0 ${-r}`;
  return `${outer} ${inner} Z`;
}

/** Vertical extent of the landscape layers in canvas units (tallest peaks start near y=60). */
const LAND_H = 140;

/**
 * The full illustration: sky, stars, sun or moon on its arc, and a landscape whose colors and
 * shadows follow the sun. Fills its box anchored bottom-centre, so it works at any aspect ratio.
 * `fit="cover"` scales the 1200×200 canvas to cover the box (banners, thumbnails); `fit="page"`
 * keeps the landscape in the lower part of a tall box and extends the sky above it.
 */
function SceneArt({
  scene,
  sky,
  className,
  fit = 'cover',
  size,
}: {
  scene: SceneId;
  sky: SkyState;
  className?: string;
  fit?: 'cover' | 'page';
  /** Box size in CSS px when the caller knows it (e.g. a window in another document); otherwise measured. */
  size?: [number, number];
}) {
  const id = useId().replace(/:/g, '');
  const [ref, measured] = useBoxSize([1200, 140]);
  const [w, h] = size ?? measured;
  const def = SCENES[scene];
  const { palette: pal } = sky;

  // Visible part of the 1200×200 canvas for this box.
  const s = fit === 'page' ? Math.max(w / VIEW_W, (h * 0.56) / LAND_H) : Math.max(w / VIEW_W, h / VIEW_H);
  const vw = w / s;
  const vh = h / s;
  const x0 = (VIEW_W - vw) / 2;
  const y0 = VIEW_H - vh;

  const sunR = clamp((fit === 'page' ? 24 : 15) / s, 9, 30);
  const peakY = y0 + Math.max(sunR + 6, vh * 0.2);
  const arcX = (f: number) => x0 + vw * (0.07 + 0.86 * clamp(f, -0.06, 1.06));
  const arcY = (lift: number) => def.horizon - (def.horizon - peakY) * lift;

  const sunX = arcX(sky.sunFrac);
  const sunY = arcY(sky.altitude / Math.max(sky.noonAltitude, 20));
  const moon = sky.moonFrac !== null && pal.starOpacity > 0;
  const moonX = moon ? arcX(sky.moonFrac!) : 0;
  const moonY = arcY(Math.sin(Math.PI * (sky.moonFrac ?? 0)) * 0.85);
  const p = makePaint(sky, pal.starOpacity > 0.5 && moon ? moonX : sunX);
  const Draw = def.Draw;
  const cloudColor = mixHex(mixHex('#ffffff', pal.glow, pal.warm * 0.45), '#4a5482', (1 - pal.ambient) * 0.75);

  return (
    <svg
      ref={ref}
      className={`sc-art${className ? ` ${className}` : ''}`}
      viewBox={`${x0.toFixed(1)} ${y0.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1={y0} y2={def.horizon + 10} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={pal.skyTop} />
          <stop offset="0.55" stopColor={pal.skyMid} />
          <stop offset="1" stopColor={pal.skyLow} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={pal.glow} stopOpacity="0.85" />
          <stop offset="1" stopColor={pal.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-moonglow`}>
          <stop offset="0" stopColor="#dfe6ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#dfe6ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0" stopColor={pal.sun} stopOpacity="0.55" />
          <stop offset="1" stopColor={pal.sun} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={-40} y={Math.min(-200, y0 - 20)} width={VIEW_W + 80} height={VIEW_H - Math.min(-200, y0 - 20)} fill={`url(#${id}-sky)`} />

      {pal.starOpacity > 0 && (
        <g className="sc-stars" fill="#ffffff" style={{ opacity: pal.starOpacity }}>
          {STARS.map((st, i) => (
            <circle key={i} className={`sc-star sc-star--${st.g}`} cx={st.x} cy={y0 + (st.y / 150) * (def.horizon - y0)} r={st.r / Math.max(s, 0.6)} />
          ))}
        </g>
      )}

      {pal.warm > 0.01 && (
        <ellipse
          cx={clamp(sunX, x0, x0 + vw)}
          cy={def.horizon}
          rx={vw * 0.42}
          ry={Math.max(60, vh * 0.55)}
          fill={`url(#${id}-glow)`}
          style={{ opacity: pal.warm * 0.8 }}
        />
      )}

      {sky.altitude > -2 && (
        <g className="sc-sun" transform={`translate(${sunX.toFixed(1)} ${sunY.toFixed(1)})`}>
          <circle r={sunR * 3.2} fill={`url(#${id}-halo)`} />
          <circle r={sunR} fill={pal.sun} />
        </g>
      )}

      {moon && (
        <g className="sc-moon" transform={`translate(${moonX.toFixed(1)} ${moonY.toFixed(1)})`} style={{ opacity: Math.min(1, pal.starOpacity * 1.6) }}>
          <circle r={sunR * 2.6} fill={`url(#${id}-moonglow)`} />
          <circle r={sunR * 0.8} fill="#2f3a66" style={{ opacity: 0.55 }} />
          <path d={moonPath(sky.moonPhase, sunR * 0.8)} fill="#f3f1e4" />
        </g>
      )}

      <g className="sc-clouds" fill={cloudColor} style={{ opacity: 0.5 + pal.ambient * 0.35 }}>
        {CLOUDS.map((c, i) => {
          const k = c.k * clamp(1.4 / s, 0.35, 1.2);
          return (
            <g key={i} transform={`translate(${(x0 - 60 * k).toFixed(1)} ${(y0 + (def.horizon - y0) * c.y).toFixed(1)})`}>
              <g
                className="sc-cloud"
                style={{
                  ['--drift' as string]: `${(vw + 120 * k).toFixed(0)}px`,
                  animationDuration: `${c.dur}s`,
                  animationDelay: `${(-c.dur * (i + 0.5)) / CLOUDS.length}s`,
                }}
              >
                <g transform={`scale(${k.toFixed(3)})`}>
                  <Cloud />
                </g>
              </g>
            </g>
          );
        })}
      </g>

      <Draw p={p} id={id} />
    </svg>
  );
}

export default memo(SceneArt);
