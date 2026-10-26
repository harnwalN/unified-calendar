import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import type { SceneId } from '../../types';
import { makePaint, rng, VIEW_H, VIEW_W } from './paint';
import { SCENES } from './scenes';
import type { SkyState } from './sky';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const STARS = (() => {
  const r = rng(42);
  return Array.from({ length: 70 }, (_, i) => ({ x: r() * VIEW_W, y: r() * 150, r: 0.5 + r() * 0.9, g: i % 3 }));
})();

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

/**
 * The full illustration: sky, stars, sun or moon on its arc, and a landscape whose colors and
 * shadows follow the sun. Fills its box (xMidYMax slice), so it works at any aspect ratio.
 */
function SceneArt({ scene, sky, className }: { scene: SceneId; sky: SkyState; className?: string }) {
  const id = useId().replace(/:/g, '');
  const [ref, [w, h]] = useBoxSize([1200, 140]);
  const def = SCENES[scene];
  const { palette: pal } = sky;

  // Visible part of the 1200×200 canvas for this box.
  const s = Math.max(w / VIEW_W, h / VIEW_H);
  const vw = w / s;
  const vh = h / s;
  const x0 = (VIEW_W - vw) / 2;
  const y0 = VIEW_H - vh;

  const sunR = clamp(15 / s, 9, 30);
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

  return (
    <svg
      ref={ref}
      className={`sc-art${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
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
      <rect x={-40} y={-200} width={VIEW_W + 80} height={VIEW_H + 200} fill={`url(#${id}-sky)`} />

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

      <Draw p={p} id={id} />
    </svg>
  );
}

export default memo(SceneArt);
