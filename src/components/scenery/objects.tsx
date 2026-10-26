// Geometric scene objects. Each takes the shared Paint, stands at (x, gy) and draws a
// two-tone body (lit side toward the sun) plus its ground shadow.
import type { Paint } from './paint';

export interface Placed {
  x: number;
  gy: number;
  h: number;
}

export function Shadow({ p, x, gy, w, h, box }: { p: Paint; x: number; gy: number; w: number; h: number; box?: boolean }) {
  const pts = p.shadow(x, gy, w, h, box);
  if (!pts) return null;
  return <polygon className="sc-shadow" points={pts} style={{ opacity: p.shadowOpacity }} />;
}

/** A group of shadows clipped to a ground shape so they never spill into the sky. */
export function Shadows({ p, clip, items, w, box }: { p: Paint; clip: string; items: Placed[]; w: (h: number) => number; box?: boolean }) {
  if (p.shadowOpacity <= 0.01) return null;
  return (
    <g clipPath={`url(#${clip})`}>
      {items.map((o, i) => (
        <Shadow key={i} p={p} x={o.x} gy={o.gy} w={w(o.h)} h={o.h} box={box} />
      ))}
    </g>
  );
}

export function Pine({ p, x, gy, h, color = '#3b7d5a', depth = 0 }: Placed & { p: Paint; color?: string; depth?: number }) {
  const w = h * 0.46;
  const top = gy - h;
  const trunk = h * 0.12;
  const leftLit = p.sunLeftOf(x);
  return (
    <g>
      <rect x={x - h * 0.035} y={gy - trunk - 1} width={h * 0.07} height={trunk + 1} fill={p.c('#6d4c3d', depth)} />
      <polygon points={`${x - w / 2},${gy - trunk} ${x},${top} ${x},${gy - trunk}`} fill={p.face(color, depth, leftLit)} />
      <polygon points={`${x},${top} ${x + w / 2},${gy - trunk} ${x},${gy - trunk}`} fill={p.face(color, depth, !leftLit)} />
    </g>
  );
}

export function RoundTree({ p, x, gy, h, color = '#4c9a52', depth = 0 }: Placed & { p: Paint; color?: string; depth?: number }) {
  const r = h * 0.32;
  const cy = gy - h + r;
  const leftLit = p.sunLeftOf(x);
  // Lit half-disc on the sun side over a shaded full disc.
  const half = leftLit
    ? `M${x} ${cy - r} A${r} ${r} 0 0 0 ${x} ${cy + r} Z`
    : `M${x} ${cy - r} A${r} ${r} 0 0 1 ${x} ${cy + r} Z`;
  return (
    <g>
      <rect x={x - h * 0.04} y={cy} width={h * 0.08} height={gy - cy} fill={p.c('#7a5443', depth)} />
      <circle cx={x} cy={cy} r={r} fill={p.face(color, depth, false)} />
      <path d={half} fill={p.face(color, depth, true)} />
    </g>
  );
}

export function Cactus({ p, x, gy, h, depth = 0 }: Placed & { p: Paint; depth?: number }) {
  const w = h * 0.2;
  const leftLit = p.sunLeftOf(x);
  const body = p.face('#4f9a63', depth, false);
  const lit = p.face('#4f9a63', depth, true);
  const arms = `M${x} ${gy - h * 0.42} h${-h * 0.26} v${-h * 0.26} M${x} ${gy - h * 0.58} h${h * 0.24} v${-h * 0.2}`;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={arms} stroke={body} strokeWidth={w * 0.7} />
      <path d={`M${x} ${gy} V${gy - h + w / 2}`} stroke={body} strokeWidth={w} />
      <path d={`M${x + (leftLit ? -w * 0.22 : w * 0.22)} ${gy} V${gy - h + w / 2}`} stroke={lit} strokeWidth={w * 0.4} />
    </g>
  );
}

export function Rock({ p, x, gy, h, color = '#8b8f9c', depth = 0 }: Placed & { p: Paint; color?: string; depth?: number }) {
  const w = h * 2.2;
  const leftLit = p.sunLeftOf(x);
  const peak = x - w * 0.1;
  return (
    <g>
      <polygon points={`${x - w / 2},${gy + 1} ${x - w * 0.32},${gy - h * 0.7} ${peak},${gy - h} ${peak},${gy + 1}`} fill={p.face(color, depth, leftLit)} />
      <polygon points={`${peak},${gy - h} ${x + w * 0.3},${gy - h * 0.62} ${x + w / 2},${gy + 1} ${peak},${gy + 1}`} fill={p.face(color, depth, !leftLit)} />
    </g>
  );
}

/** A triangular mountain with sun/shade faces and an optional snow cap. */
export function Peak({ p, px, py, l, r, gy, color, depth, snow }: { p: Paint; px: number; py: number; l: number; r: number; gy: number; color: string; depth: number; snow?: boolean }) {
  const leftLit = p.sunLeftOf(px);
  const f = 0.3;
  const ly = py + (gy - py) * f;
  const lx = px - (px - l) * f;
  const rx = px + (r - px) * f;
  const cap = (a: number) => px + (a - px) * f;
  return (
    <g>
      <polygon points={`${l},${gy} ${px},${py} ${px},${gy}`} fill={p.face(color, depth, leftLit)} />
      <polygon points={`${px},${py} ${r},${gy} ${px},${gy}`} fill={p.face(color, depth, !leftLit)} />
      {snow && (
        <>
          <polygon points={`${px},${py} ${lx},${ly} ${cap(l + (px - l) * 0.45)},${ly - 6} ${px - 4},${ly + 3} ${px},${ly - 2}`} fill={p.face('#f4f7ff', depth, leftLit)} />
          <polygon points={`${px},${py} ${rx},${ly} ${cap(r - (r - px) * 0.4)},${ly - 5} ${px + 5},${ly + 4} ${px},${ly - 2}`} fill={p.face('#f4f7ff', depth, !leftLit)} />
        </>
      )}
    </g>
  );
}
