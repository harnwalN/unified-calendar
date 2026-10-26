// Live tab icon: today's date on a calendar tile whose color follows the time of day.
import { useEffect } from 'react';

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

/** SVG markup for the icon: colored header band + date number. */
export function faviconSvg(date: Date): string {
  const color = timeOfDayColor(date);
  const day = date.getDate();
  const size = day >= 10 ? 34 : 38;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect x="3" y="5" width="58" height="56" rx="12" fill="#fff" stroke="${color}" stroke-width="4"/>
<path d="M3 17a12 12 0 0 1 12-12h34a12 12 0 0 1 12 12v5H3z" fill="${color}"/>
<text x="32" y="53" font-family="Google Sans,Roboto,Arial,sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" fill="${color}">${day}</text>
</svg>`;
}

/** Mount once in <App/>: keeps the tab icon on today's date and the current time-of-day color. */
export function useDynamicFavicon(): void {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    let last = '';
    const update = () => {
      const svg = faviconSvg(new Date());
      if (svg === last) return;
      last = svg;
      link!.type = 'image/svg+xml';
      link!.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };
    update();
    const id = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
}
