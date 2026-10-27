import { describe, expect, it } from 'vitest';
import { assignLanes, EVENT_COLORS, eventColors, hourRange, inkFor, pct } from './timeline';

const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime();

describe('today bar layout', () => {
  it('uses the waking day and widens it for early or late spans and the current time', () => {
    const day = at(0);
    expect(hourRange([], day, at(12))).toEqual([7, 23]);
    expect(hourRange([{ id: 'a', start: at(5, 30), end: at(6, 30) }], day)).toEqual([5, 23]);
    expect(hourRange([{ id: 'a', start: at(22), end: at(23, 30) }], day)).toEqual([7, 24]);
    expect(hourRange([], day, at(1, 15))).toEqual([1, 23]);
    // `now` on another day doesn't widen the range.
    expect(hourRange([], day, at(1, 15) + 86_400_000)).toEqual([7, 23]);
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

describe('event colors', () => {
  it('gives the same title the same color and keeps neighbours apart', () => {
    const ev = (id: string, title: string, h: number) => ({ id, title, start: at(h), end: at(h + 1) });
    const a = eventColors([ev('1', 'CSE 110 Lecture', 9), ev('2', 'CSE 110 Lecture', 14)]);
    expect(a.get('1')).toBe(a.get('2'));
    const b = eventColors([ev('1', 'Same', 9), ev('2', 'Same', 10)]);
    expect(b.get('1')).not.toBe(b.get('2'));
    expect(EVENT_COLORS).toContain(b.get('2'));
  });

  it('picks readable text', () => {
    expect(inkFor('#f6bf26')).toBe('#1f1f1f');
    expect(inkFor('#3f51b5')).toBe('#ffffff');
  });
});
