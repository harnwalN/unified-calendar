// Live tab icon: today's date on a calendar tile whose color follows the time of day.
import { useEffect } from 'react';
import { useStore } from '../store';

/** [hour of day, color] keyframes; colors are interpolated between them. */
const KEYFRAMES: [number, string][] = [
  [0, '#1a237e'], // night
  [5, '#3949ab'], // pre-dawn
  [6.5, '#f4511e'], // sunrise
  [8, '#f6a609'], // morning gold
  [11, '#1a73e8'], // day
  [16, '#039be5'], // afternoon
  [18.5, '#e8710a'], // sunset
  [19.5, '#8e24aa'], // dusk
  [21, '#283593'], // evening
  [24, '#1a237e'],
];

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Color for a moment of the day, smoothly interpolated between keyframes. */
export function timeOfDayColor(date: Date): string {
  const h = date.getHours() + date.getMinutes() / 60;
  for (let i = 1; i < KEYFRAMES.length; i++) {
    const [h1, c1] = KEYFRAMES[i];
    if (h <= h1) {
      const [h0, c0] = KEYFRAMES[i - 1];
      const t = (h - h0) / (h1 - h0);
      const a = toRgb(c0);
      const b = toRgb(c1);
      return toHex(a.map((v, j) => v + (b[j] - v) * t));
    }
  }
  return KEYFRAMES[0][1];
}

/** Stopwatch label for the icon: "0m"…"59m", then "1:05". */
export function elapsedLabel(ms: number): string {
  const min = Math.floor(ms / 60_000);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

const TIMER_COLOR = '#d93025';

/**
 * SVG markup for the icon: a centered calendar tile with a colored header band and the date
 * number. While a stopwatch runs (`elapsedMs` set) it shows the elapsed time in red instead.
 */
export function faviconSvg(date: Date, elapsedMs?: number): string {
  const timing = elapsedMs !== undefined;
  const color = timing ? TIMER_COLOR : timeOfDayColor(date);
  const text = timing ? elapsedLabel(elapsedMs) : String(date.getDate());
  const size = text.length <= 1 ? 38 : text.length === 2 ? 34 : text.length === 3 ? 27 : 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect x="4" y="4" width="56" height="56" rx="12" fill="#fff" stroke="${color}" stroke-width="4"/>
<path d="M4 16a12 12 0 0 1 12-12h32a12 12 0 0 1 12 12v4H4z" fill="${color}"/>
${timing ? '<circle cx="32" cy="12" r="3.5" fill="#fff"/>' : ''}
<text x="32" y="${timing ? 49 : 51}" font-family="Google Sans,Roboto,Arial,sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" fill="${color}">${text}</text>
</svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * Mount once in <App/>: keeps the tab icon on today's date in the current time-of-day color,
 * or on the running stopwatch's elapsed time while one is timing.
 */
export function useDynamicFavicon(): void {
  const timer = useStore((s) => s.runningTimer);
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    let last = '';
    const update = () => {
      const now = new Date();
      const svg = faviconSvg(now, timer ? Math.max(0, now.getTime() - Date.parse(timer.start)) : undefined);
      if (svg === last) return;
      last = svg;
      link!.type = 'image/svg+xml';
      link!.href = svgDataUrl(svg);
    };
    update();
    const id = setInterval(update, timer ? 5_000 : 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', update);
    };
  }, [timer]);
}
