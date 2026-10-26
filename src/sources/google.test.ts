import { describe, expect, it } from 'vitest';
import { mapGoogleEvent, type GEvent } from './google';

const timed = (patch: Partial<GEvent> = {}): GEvent => ({
  id: 'e1',
  summary: 'Lunch',
  start: { dateTime: '2026-10-30T12:00:00-07:00' },
  end: { dateTime: '2026-10-30T13:00:00-07:00' },
  htmlLink: 'https://calendar.google.com/event?eid=1',
  ...patch,
});

describe('mapGoogleEvent', () => {
  it('maps timed events', () => {
    const e = mapGoogleEvent(timed({ description: '<b>Bring</b> notes' }), 'google:a:cal', 'cal')!;
    expect(e).toMatchObject({
      id: 'google:a:cal:e1', uid: 'cal:e1', kind: 'event', allDay: false, title: 'Lunch',
      description: 'Bring notes', url: 'https://calendar.google.com/event?eid=1',
    });
    expect(e.start).toBe('2026-10-30T19:00:00.000Z');
  });

  it('maps all-day events to local midnight', () => {
    const e = mapGoogleEvent({ id: 'e2', summary: 'Trip', start: { date: '2026-11-02' }, end: { date: '2026-11-04' } }, 'g', 'cal')!;
    expect(e.allDay).toBe(true);
    expect(e.start).toBe(new Date(2026, 10, 2).toISOString());
    expect(e.end).toBe(new Date(2026, 10, 4).toISOString());
  });

  it('skips cancelled events and fills missing titles', () => {
    expect(mapGoogleEvent(timed({ status: 'cancelled' }), 'g', 'cal')).toBeNull();
    expect(mapGoogleEvent(timed({ summary: '  ' }), 'g', 'cal')!.title).toBe('(No title)');
  });
});
