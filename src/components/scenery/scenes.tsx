// The six landscapes. Geometry is built once at module load; only colors and shadows
// change with the time of day.
import { useMemo, type ReactElement } from 'react';
import type { SceneId } from '../../types';
import { Cactus, Peak, Pine, Rock, RoundTree, Shadows, type Placed } from './objects';
import { pineRow, ridge, rng, VIEW_H, VIEW_W, type Paint } from './paint';

export interface SceneProps {
  p: Paint;
  /** Unique prefix for clip-path / gradient ids (several scenes can be on one page). */
  id: string;
}

interface SceneDef {
  label: string;
  /** y of the horizon where the sun rises and sets. */
  horizon: number;
  Draw: (props: SceneProps) => ReactElement;
}

const on = (r: { y: (x: number) => number }, xs: [number, number][]): Placed[] => xs.map(([x, h]) => ({ x, gy: r.y(x) + 2, h }));

/** Glittering column of dashes under the sun / moon on water between y0 and y1. */
function Reflection({ x, y0, y1, color, opacity }: { x: number; y0: number; y1: number; color: string; opacity: number }) {
  if (opacity <= 0.01) return null;
  const rows = [];
  for (let i = 0, y = y0 + 3; y < y1; i++, y += 5 + i * 0.8) {
    const w = 10 + i * 4 + ((i * 37) % 7);
    rows.push(<rect key={i} x={x - w / 2 + ((i * 13) % 5) - 2} y={y} width={w} height={1.6 + i * 0.12} rx={1} />);
  }
  return (
    <g className="sc-reflect" fill={color} style={{ opacity }}>
      {rows}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Mountains
// ---------------------------------------------------------------------------
const M_FAR = ridge(138, [[10, 230, 0.4], [7, 97, 1.2], [4, 41, 2]], 18);
const M_PEAKS = [
  { px: 120, py: 104, l: -40, r: 250 },
  { px: 330, py: 66, l: 170, r: 500 },
  { px: 565, py: 98, l: 440, r: 700 },
  { px: 795, py: 58, l: 620, r: 985 },
  { px: 1085, py: 86, l: 930, r: 1240 },
];
const M_FOOT = ridge(166, [[5, 300, 1], [3, 120, 0]]);
const M_FOOT_TREES = pineRow(M_FOOT.y, 16, 10, 20, 7);
const M_NEAR = ridge(178, [[6, 520, 2], [3, 170, 0.5]]);
const M_PINES = on(M_NEAR, [[140, 34], [166, 26], [196, 40], [598, 30], [626, 38], [954, 36], [986, 28], [1030, 42]]);
const M_ROCKS = on(M_NEAR, [[420, 9], [760, 12]]);

function Mountains({ p, id }: SceneProps) {
  return (
    <>
      <path d={M_FAR.d} fill={p.c('#7b96cf', 0.8)} />
      {M_PEAKS.map((m, i) => (
        <Peak key={i} p={p} {...m} gy={172} color="#5872b0" depth={0.42} snow={m.py < 80} />
      ))}
      <path d={M_FOOT.d + M_FOOT_TREES} fill={p.c('#3d7a62', 0.25)} />
      <clipPath id={`${id}-mn`}>
        <path d={M_NEAR.d} />
      </clipPath>
      <path d={M_NEAR.d} fill={p.c('#63a46f')} />
      <Shadows p={p} clip={`${id}-mn`} items={M_PINES} w={(h) => h * 0.46} />
      <Shadows p={p} clip={`${id}-mn`} items={M_ROCKS} w={(h) => h * 2.2} />
      {M_ROCKS.map((o, i) => (
        <Rock key={i} p={p} {...o} />
      ))}
      {M_PINES.map((o, i) => (
        <Pine key={i} p={p} {...o} color="#2f7352" />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Hills
// ---------------------------------------------------------------------------
const H_FAR = ridge(136, [[10, 380, 0], [6, 170, 1]]);
const H_MID = ridge(158, [[12, 520, 2], [5, 210, 0.5]]);
const H_NEAR = ridge(181, [[8, 600, 1], [4, 260, 3]]);
const H_MID_TREES = on(H_MID, [[300, 22], [328, 16], [780, 20], [806, 26], [836, 18]]);
const H_NEAR_TREES = on(H_NEAR, [[118, 34], [150, 26], [508, 30], [944, 36], [1060, 28]]);
const H_BARN = { x: 640, gy: H_MID.y(640) + 3, w: 26, h: 16 };

function Hills({ p, id }: SceneProps) {
  const b = H_BARN;
  const roofLit = p.sunLeftOf(b.x);
  return (
    <>
      <path d={H_FAR.d} fill={p.c('#a6d18e', 0.7)} />
      <clipPath id={`${id}-hm`}>
        <path d={H_MID.d} />
      </clipPath>
      <path d={H_MID.d} fill={p.c('#7cbc6c', 0.35)} />
      <Shadows p={p} clip={`${id}-hm`} items={H_MID_TREES} w={(h) => h * 0.5} />
      <Shadows p={p} clip={`${id}-hm`} items={[{ x: b.x, gy: b.gy, h: b.h + 9 }]} w={() => b.w} box />
      <g>
        <rect x={b.x - b.w / 2} y={b.gy - b.h} width={b.w} height={b.h} fill={p.c('#e0645a', 0.35)} />
        <polygon points={`${b.x - b.w / 2 - 2},${b.gy - b.h} ${b.x},${b.gy - b.h - 10} ${b.x},${b.gy - b.h}`} fill={p.face('#a64a44', 0.35, roofLit)} />
        <polygon points={`${b.x},${b.gy - b.h - 10} ${b.x + b.w / 2 + 2},${b.gy - b.h} ${b.x},${b.gy - b.h}`} fill={p.face('#a64a44', 0.35, !roofLit)} />
        <rect x={b.x - 4} y={b.gy - 9} width={8} height={9} fill={p.c('#fbe9d0', 0.35)} />
      </g>
      {H_MID_TREES.map((o, i) => (
        <RoundTree key={i} p={p} {...o} depth={0.35} color="#4f9f55" />
      ))}
      <clipPath id={`${id}-hn`}>
        <path d={H_NEAR.d} />
      </clipPath>
      <path d={H_NEAR.d} fill={p.c('#57a159')} />
      <Shadows p={p} clip={`${id}-hn`} items={H_NEAR_TREES} w={(h) => h * 0.5} />
      {H_NEAR_TREES.map((o, i) => (
        <RoundTree key={i} p={p} {...o} color="#3f8f4a" />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dunes
// ---------------------------------------------------------------------------
// Flat-topped buttes: [left foot, top-left, top-right, right foot] x's, top y.
const D_MESAS = [
  { xs: [200, 222, 268, 288], top: 122 },
  { xs: [690, 720, 828, 852], top: 104 },
  { xs: [925, 942, 984, 1000], top: 126 },
];
const D_FAR = ridge(150, [[6, 300, 0.2], [3, 140, 1]]);
const D_MID = ridge(167, [[9, 420, 1.6], [4, 190, 0]]);
const D_NEAR = ridge(184, [[8, 560, 0.4], [3, 230, 2]]);
const D_MID_CACTI = on(D_MID, [[330, 34], [612, 26], [1080, 24]]);
const D_NEAR_CACTI = on(D_NEAR, [[140, 30], [880, 44]]);
const D_ROCKS = on(D_NEAR, [[470, 7], [742, 10]]);

function Dunes({ p, id }: SceneProps) {
  return (
    <>
      {D_MESAS.map(({ xs: [a, b, c, d], top }, i) => {
        const lit = p.sunLeftOf((b + c) / 2);
        return (
          <g key={i}>
            <polygon points={`${a},152 ${b},${top} ${c},${top} ${d},152`} fill={p.face('#cf8b5e', 0.6, true)} />
            <polygon
              points={lit ? `${c},${top} ${d},152 ${c - 6},152` : `${a},152 ${b},${top} ${b + 6},152`}
              fill={p.face('#cf8b5e', 0.6, false)}
            />
          </g>
        );
      })}
      <path d={D_FAR.d} fill={p.c('#f0c58c', 0.55)} />
      <clipPath id={`${id}-dm`}>
        <path d={D_MID.d} />
      </clipPath>
      <path d={D_MID.d} fill={p.c('#e7ac69', 0.25)} />
      <Shadows p={p} clip={`${id}-dm`} items={D_MID_CACTI} w={(h) => h * 0.3} />
      {D_MID_CACTI.map((o, i) => (
        <Cactus key={i} p={p} {...o} depth={0.25} />
      ))}
      <clipPath id={`${id}-dn`}>
        <path d={D_NEAR.d} />
      </clipPath>
      <path d={D_NEAR.d} fill={p.c('#f2bf7c')} />
      <Shadows p={p} clip={`${id}-dn`} items={D_NEAR_CACTI} w={(h) => h * 0.3} />
      <Shadows p={p} clip={`${id}-dn`} items={D_ROCKS} w={(h) => h * 2.2} />
      {D_ROCKS.map((o, i) => (
        <Rock key={i} p={p} {...o} color="#b98263" />
      ))}
      {D_NEAR_CACTI.map((o, i) => (
        <Cactus key={i} p={p} {...o} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Coast
// ---------------------------------------------------------------------------
const C_SEA = 140;
const C_CLIFF = 'M612 200 L640 170 L690 142 L760 129 L900 122 L1010 118 L1240 113 V200 Z';
const C_GRASS = 'M690 142 L760 129 L900 122 L1010 118 L1240 113 V124 L1010 128 L900 131 L772 137 L706 147 Z';
const C_LH = { x: 862, gy: 123.5, h: 58 };
const C_BEACH = ridge(186, [[7, 700, 2.6]]);
const C_WAVES = (() => {
  const r = rng(11);
  return Array.from({ length: 14 }, () => ({ x: r() * 640, y: C_SEA + 6 + r() * 48, w: 8 + r() * 22 }));
})();

function Coast({ p, id }: SceneProps) {
  const { x, gy, h } = C_LH;
  const lit = p.sunLeftOf(x);
  const bw = 9;
  const tw = 6.5;
  const tower = (y: number) => bw - ((gy - y) / (h - 12)) * (bw - tw);
  const band = (y0: number, y1: number) => `${x - tower(y0)},${y0} ${x + tower(y0)},${y0} ${x + tower(y1)},${y1} ${x - tower(y1)},${y1}`;
  const top = gy - h + 12;
  const reflectOn = p.sunX < 650 ? 1 : 0;
  return (
    <>
      <path d="M200 141 Q250 128 300 132 Q330 134 350 141 Z" fill={p.c('#7290bd', 0.75)} />
      <linearGradient id={`${id}-sea`} x1="0" x2="0" y1={C_SEA} y2={VIEW_H} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={p.c('#7bb3e3', 0.5)} />
        <stop offset="1" stopColor={p.c('#2a6db4')} />
      </linearGradient>
      <rect x={-40} y={C_SEA} width={VIEW_W + 80} height={VIEW_H - C_SEA} fill={`url(#${id}-sea)`} />
      <g fill="#ffffff" style={{ opacity: 0.18 + p.pal.ambient * 0.12 }}>
        {C_WAVES.map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width={w.w} height={1.4} rx={0.7} />
        ))}
      </g>
      <Reflection x={p.sunX} y0={C_SEA} y1={VIEW_H} color={p.pal.sun} opacity={reflectOn * Math.min(1, p.shadowOpacity * 3) * 0.75} />
      <path d={C_BEACH.d} fill={p.c('#efd29c')} />
      <Rock p={p} x={96} gy={C_BEACH.y(96) + 2} h={9} color="#8d8a92" />
      <clipPath id={`${id}-cg`}>
        <path d={C_GRASS} />
      </clipPath>
      <path d={C_CLIFF} fill={p.face('#b0805c', 0.1, !lit)} />
      <path d="M612 200 L640 170 L690 142 L706 147 L668 178 L650 200 Z" fill={p.face('#b0805c', 0.1, lit)} />
      <path d={C_GRASS} fill={p.c('#6aaa63', 0.1)} />
      <Shadows p={p} clip={`${id}-cg`} items={[{ x, gy: gy + 1, h }]} w={() => bw * 2} />
      {/* Lighthouse: striped tower, gallery, lantern and cap. */}
      <g>
        <polygon points={band(gy, top)} fill={p.face('#f6f1e7', 0.1, true)} />
        <polygon points={band(gy - 14, gy - 24)} fill={p.c('#e2574c', 0.1)} />
        <polygon points={band(gy - 34, top)} fill={p.c('#e2574c', 0.1)} />
        <polygon points={lit ? `${x},${gy} ${x + tower(gy)},${gy} ${x + tower(top)},${top} ${x},${top}` : `${x - tower(gy)},${gy} ${x},${gy} ${x},${top} ${x - tower(top)},${top}`} fill="#0d1330" style={{ opacity: 0.12 + p.shadowOpacity * 0.3 }} />
        <rect x={x - 9} y={top - 2} width={18} height={2.5} fill={p.c('#3b4a5e', 0.1)} />
        <rect x={x - 5} y={top - 9} width={10} height={7} fill={p.night > 0.3 ? '#ffe17a' : p.c('#d7ecff', 0.1)} />
        <polygon points={`${x - 7},${top - 9} ${x},${top - 16} ${x + 7},${top - 9}`} fill={p.c('#e2574c', 0.1)} />
      </g>
      <g className="sc-beam" style={{ opacity: p.night * 0.55 }}>
        <polygon points={`${x},${top - 6} ${x - 260},${top - 26} ${x - 260},${top + 10}`} fill={`url(#${id}-beam)`} />
      </g>
      <linearGradient id={`${id}-beam`} x1={x} x2={x - 260} y1="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ffe9a3" stopOpacity="0.9" />
        <stop offset="1" stopColor="#ffe9a3" stopOpacity="0" />
      </linearGradient>
    </>
  );
}

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------
const CT_GROUND = 182;
const CT_FAR = (() => {
  const r = rng(3);
  let d = '';
  for (let x = -30; x < VIEW_W + 30; ) {
    const w = 26 + r() * 40;
    const h = 22 + r() * 46;
    d += `M${x.toFixed(1)} 172 V${(172 - h).toFixed(1)} h${w.toFixed(1)} V172 Z`;
    x += w + 2 + r() * 10;
  }
  return d;
})();
const CT_COLORS = ['#5d72a3', '#6c80b3', '#51648f', '#7487b8', '#5b7c9c'];
interface Building {
  x: number;
  w: number;
  h: number;
  color: string;
  windows: { x: number; y: number; t: number }[];
}
const CT_BUILDINGS: Building[] = (() => {
  const r = rng(21);
  const out: Building[] = [];
  for (let x = -20; x < VIEW_W + 20; ) {
    const w = 38 + r() * 44;
    const tall = r() > 0.75;
    const h = (tall ? 80 : 36) + r() * (tall ? 34 : 44);
    const windows: Building['windows'] = [];
    for (let wy = CT_GROUND - h + 8; wy < CT_GROUND - 10; wy += 9) {
      for (let wx = x + 6; wx < x + w - 9; wx += 9) windows.push({ x: wx, y: wy, t: r() });
    }
    out.push({ x, w, h, color: CT_COLORS[Math.floor(r() * CT_COLORS.length)], windows });
    x += w + 4 + r() * 12;
  }
  return out;
})();
const CT_TREES: Placed[] = [70, 260, 470, 690, 905, 1120].map((x) => ({ x, gy: 190, h: 16 }));

function rects(ws: { x: number; y: number }[]) {
  return ws.map((w) => `M${w.x.toFixed(1)} ${w.y.toFixed(1)}h4v5h-4Z`).join('');
}

function City({ p, id }: SceneProps) {
  // Lights switch on through dusk; bucketed so the path strings are reused across minutes.
  const lit = Math.round(p.night * 20) / 20;
  const windows = useMemo(() => {
    const on: Building['windows'] = [];
    const off: Building['windows'] = [];
    for (const b of CT_BUILDINGS) for (const w of b.windows) (w.t < lit * 0.62 ? on : off).push(w);
    return { on: rects(on), off: rects(off) };
  }, [lit]);
  return (
    <>
      <path d={CT_FAR} fill={p.c('#8ea6d2', 0.65)} />
      <rect x={-40} y={CT_GROUND} width={VIEW_W + 80} height={VIEW_H - CT_GROUND} fill={p.c('#5d6875')} />
      <rect x={-40} y={CT_GROUND} width={VIEW_W + 80} height={3} fill={p.c('#8a95a3')} />
      <clipPath id={`${id}-cs`}>
        <rect x={-40} y={CT_GROUND} width={VIEW_W + 80} height={VIEW_H - CT_GROUND} />
      </clipPath>
      <Shadows p={p} clip={`${id}-cs`} items={CT_BUILDINGS.map((b) => ({ x: b.x + b.w / 2, gy: CT_GROUND, h: Math.min(b.h, 60) }))} w={(h) => h} box />
      {CT_BUILDINGS.map((b, i) => {
        const sideLeft = !p.sunLeftOf(b.x + b.w / 2);
        return (
          <g key={i}>
            <rect x={b.x} y={CT_GROUND - b.h} width={b.w} height={b.h} fill={p.c(b.color, 0.2)} />
            <rect x={sideLeft ? b.x : b.x + b.w - 7} y={CT_GROUND - b.h} width={7} height={b.h} fill={p.face(b.color, 0.2, false)} />
          </g>
        );
      })}
      <path d={windows.off} fill={p.c('#c9dcf3', 0.2)} style={{ opacity: 0.55 }} />
      <path d={windows.on} fill="#ffd76a" />
      <Shadows p={p} clip={`${id}-cs`} items={CT_TREES} w={(h) => h * 0.5} />
      {CT_TREES.map((o, i) => (
        <RoundTree key={i} p={p} {...o} color="#4c9a58" />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Forest
// ---------------------------------------------------------------------------
const F_FAR = ridge(146, [[6, 330, 0.8], [3, 120, 2]]);
const F_FAR_TREES = pineRow(F_FAR.y, 12, 10, 22, 5);
const F_MID = ridge(160, [[5, 410, 2.2], [2, 150, 1]]);
const F_MID_TREES = pineRow(F_MID.y, 21, 16, 36, 9);
const F_LAKE = 166;
const F_LEFT = 'M-40 200 V166 L60 166 Q200 168 330 176 Q380 186 360 200 Z';
const F_RIGHT = 'M1240 200 V166 L1120 166 Q980 168 880 178 Q830 188 850 200 Z';
const F_NEAR = 'M-40 200 V194 Q600 186 1240 194 V200 Z';
const F_PINES: Placed[] = [
  [40, 46], [78, 58], [118, 42], [176, 50], [292, 36], [326, 28],
  [880, 34], [918, 46], [1004, 54], [1050, 40], [1098, 60], [1150, 46],
].map(([x, h]) => ({ x, gy: x < 600 ? (x < 250 ? 168 : 168 + (x - 250) * 0.11) : x > 1000 ? 167 : 168 + (1000 - x) * 0.09, h }));

function Forest({ p, id }: SceneProps) {
  const inLake = p.sunX > 360 && p.sunX < 850 ? 1 : 0;
  return (
    <>
      <path d={F_FAR.d + F_FAR_TREES} fill={p.c('#5f9488', 0.75)} />
      <path d={F_MID.d + F_MID_TREES} fill={p.c('#3f7b68', 0.45)} />
      <linearGradient id={`${id}-lake`} x1="0" x2="0" y1={F_LAKE} y2={VIEW_H} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={p.c('#8cc3e6', 0.45)} />
        <stop offset="1" stopColor={p.c('#3a83b8')} />
      </linearGradient>
      <rect x={-40} y={F_LAKE} width={VIEW_W + 80} height={VIEW_H - F_LAKE} fill={`url(#${id}-lake)`} />
      <Reflection x={p.sunX} y0={F_LAKE} y1={192} color={p.pal.sun} opacity={inLake * Math.min(1, p.shadowOpacity * 3) * 0.7} />
      <clipPath id={`${id}-fb`}>
        <path d={F_LEFT + F_RIGHT} />
      </clipPath>
      <path d={F_LEFT} fill={p.c('#5aa062')} />
      <path d={F_RIGHT} fill={p.c('#5aa062')} />
      <Shadows p={p} clip={`${id}-fb`} items={F_PINES} w={(h) => h * 0.46} />
      {F_PINES.map((o, i) => (
        <Pine key={i} p={p} {...o} color="#2e6e4f" />
      ))}
      <path d={F_NEAR} fill={p.c('#3f8650')} />
    </>
  );
}

export const SCENES: Record<SceneId, SceneDef> = {
  mountains: { label: 'Mountains', horizon: 150, Draw: Mountains },
  hills: { label: 'Hills', horizon: 150, Draw: Hills },
  dunes: { label: 'Dunes', horizon: 152, Draw: Dunes },
  coast: { label: 'Coast', horizon: C_SEA, Draw: Coast },
  city: { label: 'City', horizon: 160, Draw: City },
  forest: { label: 'Forest', horizon: 150, Draw: Forest },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];
