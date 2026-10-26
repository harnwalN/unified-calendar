import { describe, expect, it } from 'vitest';
import { buildBlocks, dayKeys, defaultStartTime, formatBlock, mergeBlocks, totalScheduledMin } from './schedule';

describe('schedule helpers', () => {
  it('rounds the default start to the next half hour', () => {
    expect(defaultStartTime(new Date(2026, 9, 26, 14, 10))).toBe('14:30');
    expect(defaultStartTime(new Date(2026, 9, 26, 14, 30))).toBe('15:00');
    expect(defaultStartTime(new Date(2026, 9, 26, 22, 40))).toBe('09:00');
  });

  it('builds one block per selected day at the same local time', () => {
    const blocks = buildBlocks(['2026-10-30', '2026-10-28'], '14:00', 90);
    expect(blocks.map((b) => b.start)).toEqual([
      new Date(2026, 9, 28, 14).toISOString(),
      new Date(2026, 9, 30, 14).toISOString(),
    ]);
    expect(blocks.every((b) => b.durationMin === 90)).toBe(true);
  });

  it('merges without duplicates and sums durations', () => {
    const a = buildBlocks(['2026-10-28'], '14:00', 60);
    const merged = mergeBlocks(a, [...buildBlocks(['2026-10-28'], '14:00', 60), ...buildBlocks(['2026-10-27'], '09:00', 30)]);
    expect(merged).toHaveLength(2);
    expect(merged[0].start).toBe(new Date(2026, 9, 27, 9).toISOString());
    expect(totalScheduledMin(merged)).toBe(90);
  });

  it('lists consecutive days and formats blocks', () => {
    expect(dayKeys(new Date(2026, 9, 31), 3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(formatBlock({ id: 'x', start: new Date(2026, 9, 28, 14).toISOString(), durationMin: 90 })).toBe('Wed, Oct 28 · 2:00 – 3:30 PM');
    expect(formatBlock({ id: 'x', start: new Date(2026, 9, 28, 11).toISOString(), durationMin: 120 })).toBe('Wed, Oct 28 · 11:00 AM – 1:00 PM');
  });
});
