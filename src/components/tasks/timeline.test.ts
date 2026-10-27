import { describe, expect, it } from 'vitest';
import { assignLanes, hourRange, pct } from './timeline';

const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime();

describe('today bar layout', () => {
  it('uses the waking day and widens it for early or late spans and the current time', () => {
    const now = new Date(2026, 9, 26, 12);
    expect(hourRange([], now)).toEqual([7, 23]);
    expect(hourRange([{ id: 'a', start: at(5, 30), end: at(6, 30) }], now)).toEqual([5, 23]);
    expect(hourRange([{ id: 'a', start: at(22), end: at(23, 30) }], now)).toEqual([7, 24]);
    expect(hourRange([], new Date(2026, 9, 26, 1, 15))).toEqual([1, 23]);
  });

  it('stacks overlapping spans into lanes', () => {
    const lanes = assignLanes([
      { id: 'a', start: at(9), end: at(10) },
      { id: 'b', start: at(9, 30), end: at(11) },
      { id: 'c', start: at(10), end: at(10, 30) },
    ]);
    expect(Object.fromEntries(lanes.map((l) => [l.span.id, l.lane]))).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('maps times to percentages of the range', () => {
    const day = at(0);
    expect(pct(at(7), day, [7, 23])).toBe(0);
    expect(pct(at(15), day, [7, 23])).toBe(50);
    expect(pct(at(3), day, [7, 23])).toBe(0);
  });
});
