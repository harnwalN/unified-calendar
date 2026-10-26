import { describe, expect, it } from 'vitest';
import { elapsedLabel, faviconSvg, timeOfDayColor } from './favicon';

const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m);

describe('timeOfDayColor', () => {
  it('hits keyframes exactly', () => {
    expect(timeOfDayColor(at(0))).toBe('#1a237e');
    expect(timeOfDayColor(at(11))).toBe('#1a73e8');
    expect(timeOfDayColor(at(18, 30))).toBe('#e8710a');
  });

  it('interpolates between keyframes', () => {
    const mid = timeOfDayColor(at(13, 30)); // between day blue and afternoon blue
    expect(mid).not.toBe('#1a73e8');
    expect(mid).not.toBe('#039be5');
    expect(mid).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('is warm at sunrise and dark at night', () => {
    const [r, , b] = [1, 3, 5].map((i) => parseInt(timeOfDayColor(at(6, 30)).slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    const [r2, , b2] = [1, 3, 5].map((i) => parseInt(timeOfDayColor(at(23)).slice(i, i + 2), 16));
    expect(b2).toBeGreaterThan(r2);
  });
});

describe('faviconSvg', () => {
  it('shows the day of the month in the time-of-day color', () => {
    const svg = faviconSvg(at(11));
    expect(svg).toContain('>26</text>');
    expect(svg).toContain('#1a73e8');
  });
});

describe('stopwatch on the icon', () => {
  it('formats elapsed time compactly', () => {
    expect(elapsedLabel(0)).toBe('0m');
    expect(elapsedLabel(25 * 60_000 + 59_000)).toBe('25m');
    expect(elapsedLabel(65 * 60_000)).toBe('1:05');
  });
  it('shows elapsed time in red while timing', () => {
    const svg = faviconSvg(at(11), 25 * 60_000);
    expect(svg).toContain('>25m</text>');
    expect(svg).toContain('#d93025');
    expect(svg).not.toContain('>26</text>');
  });
});
